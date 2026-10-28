import {
  AssignmentStatus,
  TicketStatus,
  UserRole
} from "../src/generated/prisma/client.js";
import { AdminTicketService } from "../src/services/admin-ticket.service.js";

const adminId = "550e8400-e29b-41d4-a716-446655440001";
const ticketId = "550e8400-e29b-41d4-a716-446655440002";
const staffId = "550e8400-e29b-41d4-a716-446655440003";

function database() {
  const transaction = {
    maintenanceTicket: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    ticketAssignment: { create: jest.fn(), update: jest.fn() },
    ticketUpdate: { create: jest.fn() },
  };
  const db = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction)),
    maintenanceTicket: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  return { db, transaction };
}

describe("AdminTicketService", () => {
  it("lists visible tickets with resident, assignment details, filters, and pagination", async () => {
    const { db } = database();
    db.maintenanceTicket.findMany.mockResolvedValue([{ id: ticketId }]);
    db.maintenanceTicket.count.mockResolvedValue(21);
    const service = new AdminTicketService(db as never);

    await expect(service.list({
      status: TicketStatus.PENDING,
      hostelId: "550e8400-e29b-41d4-a716-446655440004",
      unassigned: true,
      page: 2,
      limit: 10,
    })).resolves.toEqual({
      data: [{ id: ticketId }],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });

    expect(db.maintenanceTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        status: TicketStatus.PENDING,
        hostelId: "550e8400-e29b-41d4-a716-446655440004",
        assignments: { none: { status: { in: [
          AssignmentStatus.AWAITING_RESPONSE,
          AssignmentStatus.ACCEPTED,
        ] } } },
      }),
      include: expect.objectContaining({
        resident: expect.any(Object),
        assignments: expect.any(Object),
      }),
      skip: 10,
      take: 10,
    }));
  });

  it("returns ticket detail with assignment and chronological update histories", async () => {
    const { db } = database();
    db.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
    const service = new AdminTicketService(db as never);

    await expect(service.getById(ticketId)).resolves.toEqual({ id: ticketId });
    expect(db.maintenanceTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ticketId, deletedAt: null },
      include: expect.objectContaining({
        resident: expect.any(Object),
        assignments: expect.any(Object),
        updates: expect.objectContaining({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      }),
    }));
  });

  it("returns 404 for a missing ticket", async () => {
    const { db } = database();
    db.maintenanceTicket.findFirst.mockResolvedValue(null);
    const service = new AdminTicketService(db as never);

    await expect(service.getById(ticketId)).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("assigns an eligible ticket to staff with a 24-hour deadline and history", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
    transaction.user.findFirst.mockResolvedValue({ id: staffId });
    transaction.maintenanceTicket.updateMany.mockResolvedValue({ count: 1 });
    transaction.ticketAssignment.create.mockResolvedValue({ id: "assignment" });
    const service = new AdminTicketService(db as never);
    const startedAt = Date.now();

    await expect(service.assign(adminId, ticketId, { staffId })).resolves.toEqual({
      id: "assignment",
    });

    const createCall = transaction.ticketAssignment.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      ticketId,
      staffId,
      assignedById: adminId,
      status: AssignmentStatus.AWAITING_RESPONSE,
      respondedAt: null,
    });
    expect(createCall.data.assignedAt.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(createCall.data.responseDeadline.getTime() - createCall.data.assignedAt.getTime())
      .toBe(24 * 60 * 60 * 1_000);
    expect(transaction.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { updatedAt: expect.any(Date) },
      })
    );
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: adminId,
        eventType: "ASSIGNED",
        message: `Ticket assigned to ${staffId}.`,
      },
    });
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("rejects assignment to a missing user or a non-staff user", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
    transaction.user.findFirst.mockResolvedValue(null);
    const service = new AdminTicketService(db as never);

    await expect(service.assign(adminId, ticketId, { staffId })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: staffId, role: UserRole.STAFF },
      select: { id: true },
    });
    expect(transaction.ticketAssignment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["active assignment", { id: ticketId }],
    ["missing ticket", null],
  ])("rejects assignment to an ineligible or %s ticket", async (_scenario, visibleTicket) => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(visibleTicket);
    const service = new AdminTicketService(db as never);

    await expect(service.assign(adminId, ticketId, { staffId })).rejects.toMatchObject({
      statusCode: visibleTicket ? 409 : 404,
    });
    expect(transaction.ticketAssignment.create).not.toHaveBeenCalled();
  });

  it.each([AssignmentStatus.DECLINED, AssignmentStatus.EXPIRED])(
    "creates a fresh assignment after a previous %s record",
    async (previousStatus) => {
      const { db, transaction } = database();
      transaction.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
      transaction.user.findFirst.mockResolvedValue({ id: staffId });
      transaction.maintenanceTicket.updateMany.mockResolvedValue({ count: 1 });
      transaction.ticketAssignment.create.mockResolvedValue({ id: "new-assignment" });
      const service = new AdminTicketService(db as never);

      await service.assign(adminId, ticketId, { staffId });

      expect(transaction.maintenanceTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          assignments: { none: { status: { in: [
            AssignmentStatus.AWAITING_RESPONSE,
            AssignmentStatus.ACCEPTED,
          ] } } },
        }),
      }));
      expect(transaction.ticketAssignment.create).toHaveBeenCalledTimes(1);
      expect(transaction.ticketAssignment.update).not.toHaveBeenCalled();
      expect(previousStatus).toMatch(/DECLINED|EXPIRED/);
    }
  );

  it("prevents a conflicting duplicate assignment", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
    transaction.user.findFirst.mockResolvedValue({ id: staffId });
    transaction.maintenanceTicket.updateMany.mockResolvedValue({ count: 0 });
    const service = new AdminTicketService(db as never);

    await expect(service.assign(adminId, ticketId, { staffId })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(transaction.ticketAssignment.create).not.toHaveBeenCalled();
    expect(transaction.ticketUpdate.create).not.toHaveBeenCalled();
  });

  it("rejects an eligible ticket and records the reason in history", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst
      .mockResolvedValueOnce({ id: ticketId })
      .mockResolvedValueOnce({ id: ticketId, status: TicketStatus.REJECTED });
    transaction.maintenanceTicket.updateMany.mockResolvedValue({ count: 1 });
    const service = new AdminTicketService(db as never);

    await expect(service.reject(adminId, ticketId, { reason: "Duplicate report." }))
      .resolves.toMatchObject({ status: TicketStatus.REJECTED });
    expect(transaction.maintenanceTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: TicketStatus.REJECTED,
        rejectionReason: "Duplicate report.",
      }),
    }));
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: adminId,
        eventType: "REJECTED",
        message: "Duplicate report.",
      },
    });
  });

  it("does not reject tickets with active assignments or work in progress", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: ticketId });
    const service = new AdminTicketService(db as never);

    await expect(service.reject(adminId, ticketId, { reason: "Not eligible" }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(transaction.ticketUpdate.create).not.toHaveBeenCalled();
  });

  it("propagates history-write failures so rejection remains transactional", async () => {
    const { db, transaction } = database();
    transaction.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });
    transaction.maintenanceTicket.updateMany.mockResolvedValue({ count: 1 });
    transaction.ticketUpdate.create.mockRejectedValue(new Error("history write failed"));
    const service = new AdminTicketService(db as never);

    await expect(service.reject(adminId, ticketId, { reason: "Duplicate" }))
      .rejects.toThrow("history write failed");
    expect(db.$transaction).toHaveBeenCalled();
  });
});

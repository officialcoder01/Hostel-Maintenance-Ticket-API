import {
  AssignmentStatus,
  TicketStatus,
} from "../src/generated/prisma/client.js";
import { StaffAssignmentService } from "../src/services/staff-assignment.service.js";

const staffId = "550e8400-e29b-41d4-a716-446655440031";
const otherStaffId = "550e8400-e29b-41d4-a716-446655440032";
const assignmentId = "550e8400-e29b-41d4-a716-446655440033";
const ticketId = "550e8400-e29b-41d4-a716-446655440034";

function database(options: {
  status?: AssignmentStatus;
  ticketStatus?: TicketStatus;
  responseDeadline?: Date;
  assignmentUpdateCount?: number;
  ticketUpdateCount?: number;
} = {}) {
  const assignment = {
    id: assignmentId,
    staffId,
    ticketId,
    status: options.status ?? AssignmentStatus.AWAITING_RESPONSE,
    responseDeadline: options.responseDeadline ?? new Date(Date.now() + 60_000),
    ticket: {
      status: options.ticketStatus ?? TicketStatus.PENDING,
      deletedAt: null,
    },
  };
  const transaction = {
    ticketAssignment: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce({ id: assignmentId }),
      updateMany: jest.fn().mockResolvedValue({
        count: options.assignmentUpdateCount ?? 1,
      }),
    },
    maintenanceTicket: {
      updateMany: jest.fn().mockResolvedValue({
        count: options.ticketUpdateCount ?? 1,
      }),
    },
    ticketUpdate: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: jest.fn(async (
      callback: (tx: typeof transaction) => Promise<unknown>
    ) => callback(transaction)),
    ticketAssignment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  return { db, transaction, assignment };
}

describe("StaffAssignmentService", () => {
  it("lists only the staff member's assignments with ticket details and pagination", async () => {
    const { db } = database();
    db.ticketAssignment.findMany.mockResolvedValue([{ id: assignmentId }]);
    db.ticketAssignment.count.mockResolvedValue(1);
    const service = new StaffAssignmentService(db as never);

    await expect(service.listMine(staffId, {
      status: AssignmentStatus.AWAITING_RESPONSE,
      page: 2,
      limit: 5,
    })).resolves.toEqual({
      data: [{ id: assignmentId }],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });

    expect(db.ticketAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffId, status: AssignmentStatus.AWAITING_RESPONSE },
      include: expect.objectContaining({ ticket: expect.any(Object) }),
      skip: 5,
      take: 5,
    }));
    expect(db.ticketAssignment.count).toHaveBeenCalledWith({
      where: { staffId, status: AssignmentStatus.AWAITING_RESPONSE },
    });
  });

  it("accepts an assignment and synchronizes its ticket and history", async () => {
    const { db, transaction } = database();
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId))
      .resolves.toEqual({ id: assignmentId });

    expect(transaction.ticketAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: assignmentId,
        staffId,
        status: AssignmentStatus.AWAITING_RESPONSE,
        responseDeadline: { gt: expect.any(Date) },
      },
      data: { status: AssignmentStatus.ACCEPTED, respondedAt: expect.any(Date) },
    });
    expect(transaction.maintenanceTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: TicketStatus.PENDING,
        deletedAt: null,
      },
      data: { status: TicketStatus.IN_PROGRESS, updatedAt: expect.any(Date) },
    });
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: staffId,
        eventType: "ASSIGNMENT_ACCEPTED",
        message: "Assignment accepted.",
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
  });

  it("declines an assignment, preserving the pending ticket and recording the reason", async () => {
    const { db, transaction } = database();
    const service = new StaffAssignmentService(db as never);

    await service.decline(staffId, assignmentId, { reason: "I am unavailable." });

    expect(transaction.ticketAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: AssignmentStatus.DECLINED, respondedAt: expect.any(Date) },
    }));
    expect(transaction.maintenanceTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: TicketStatus.PENDING,
        deletedAt: null,
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: staffId,
        eventType: "ASSIGNMENT_DECLINED",
        message: "I am unavailable.",
      },
    });
  });

  it("resolves accepted work and records the resolution message and timestamp", async () => {
    const { db, transaction } = database({
      status: AssignmentStatus.ACCEPTED,
      ticketStatus: TicketStatus.IN_PROGRESS,
    });
    const service = new StaffAssignmentService(db as never);

    await service.resolve(staffId, assignmentId, {
      message: "The leak has been fixed.",
    });

    expect(transaction.ticketAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: assignmentId, staffId, status: AssignmentStatus.ACCEPTED },
      data: { status: AssignmentStatus.COMPLETED },
    });
    expect(transaction.maintenanceTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: TicketStatus.IN_PROGRESS,
        deletedAt: null,
      },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: staffId,
        eventType: "RESOLVED",
        message: "The leak has been fixed.",
      },
    });
  });

  it("forbids modifying another staff member's assignment", async () => {
    const { db, transaction, assignment } = database();
    transaction.ticketAssignment.findFirst.mockReset().mockResolvedValue({
      ...assignment,
      staffId: otherStaffId,
    });
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(transaction.ticketAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("returns not found for a missing assignment", async () => {
    const { db, transaction } = database();
    transaction.ticketAssignment.findFirst.mockReset().mockResolvedValue(null);
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId)).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it.each([
    ["already accepted", AssignmentStatus.ACCEPTED, TicketStatus.IN_PROGRESS],
    ["declined", AssignmentStatus.DECLINED, TicketStatus.PENDING],
  ])("rejects an invalid repeated transition for an %s assignment", async (
    _description,
    status,
    ticketStatus
  ) => {
    const { db, transaction } = database({ status, ticketStatus });
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(transaction.ticketAssignment.updateMany).not.toHaveBeenCalled();
  });

  it.each(["accept", "decline"] as const)(
    "rejects a past-deadline %s without performing expiration",
    async (action) => {
      const { db, transaction } = database({
        responseDeadline: new Date(Date.now() - 1_000),
        assignmentUpdateCount: 0,
      });
      const service = new StaffAssignmentService(db as never);

      const response = action === "accept"
        ? service.accept(staffId, assignmentId)
        : service.decline(staffId, assignmentId, { reason: "Unavailable" });
      await expect(response).rejects.toMatchObject({ statusCode: 409 });

      expect(transaction.ticketAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          status: AssignmentStatus.AWAITING_RESPONSE,
          responseDeadline: { gt: expect.any(Date) },
        }),
      }));
      expect(transaction.ticketUpdate.create).not.toHaveBeenCalled();
      expect(transaction.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    }
  );

  it("rejects resolving an assignment that has not been accepted", async () => {
    const { db, transaction } = database();
    const service = new StaffAssignmentService(db as never);

    await expect(service.resolve(staffId, assignmentId, { message: "Done." }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.ticketAssignment.updateMany).not.toHaveBeenCalled();
    expect(transaction.maintenanceTicket.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a ticket-state conflict without writing history", async () => {
    const { db, transaction } = database({ ticketUpdateCount: 0 });
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(transaction.ticketUpdate.create).not.toHaveBeenCalled();
  });

  it("propagates history failures so the transaction can roll back all changes", async () => {
    const { db, transaction } = database();
    transaction.ticketUpdate.create.mockRejectedValue(new Error("history write failed"));
    const service = new StaffAssignmentService(db as never);

    await expect(service.accept(staffId, assignmentId))
      .rejects.toThrow("history write failed");
    expect(db.$transaction).toHaveBeenCalled();
  });
});

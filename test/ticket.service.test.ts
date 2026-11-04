import {
  AssignmentStatus,
  TicketStatus,
  UserRole
} from "../src/generated/prisma/client.js";
import { TicketService } from "../src/services/ticket.service.js";

const residentId = "550e8400-e29b-41d4-a716-446655440001";
const ticketId = "550e8400-e29b-41d4-a716-446655440002";
const hostelId = "550e8400-e29b-41d4-a716-446655440003";

function database() {
  return {
    hostel: { findUnique: jest.fn() },
    maintenanceTicket: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe("TicketService", () => {
  it("creates a pending ticket owned by the authenticated resident", async () => {
    const db = database();
    
    db.hostel.findUnique.mockResolvedValue({ id: hostelId });
    db.maintenanceTicket.create.mockResolvedValue({
      id: ticketId,
      residentId,
      status: TicketStatus.PENDING
    });

    const service = new TicketService(db as never);

    await expect(service.create(
      residentId,
      {
        hostelId,
        title: "Tap",
        description: "Leaks",
        locationDetails: "A1" 
      }
    )).resolves.toMatchObject({
      residentId,
      status: "PENDING"
    });

    expect(db.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          residentId,
          status: "PENDING"
        })
    }));
  });

  it("rejects creation for a missing hostel", async () => {
    const db = database();

    db.hostel.findUnique.mockResolvedValue(null);
    const service = new TicketService(db as never);

    await expect(service.create(
      residentId,
      {
        hostelId,
        title: "Tap",
        description: "Leaks",
        locationDetails: "A1"
      }
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists only the resident's visible tickets with stable pagination", async () => {
    const db = database();

    db.maintenanceTicket.findMany.mockResolvedValue([]);
    db.maintenanceTicket.count.mockResolvedValue(0);

    const service = new TicketService(db as never);

    await expect(service.listMine(
      residentId,
      {
        status: TicketStatus.PENDING,
        page: 2,
        limit: 10 
      }
    )).resolves.toEqual({
      data: [],
      pagination: {
        page: 2,
        limit: 10,
        total: 0,
        totalPages: 0 
      }
    });

    expect(db.maintenanceTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          residentId,
          deletedAt: null,
          status: "PENDING"
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 10,
        take: 10
      }));
  });

  it("does not return missing or unowned tickets", async () => {
    const db = database();

    db.maintenanceTicket.findFirst.mockResolvedValue(null);
    const service = new TicketService(db as never);
    
    await expect(service.getMine(residentId, ticketId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns user and system updates in chronological order for an owned ticket", async () => {
    const db = database();
    const updates = [
      {
        id: "update-1",
        ticketId,
        actorId: residentId,
        eventType: "COMMENTED",
        message: "Reported.",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        actor: { id: residentId, fullName: "Resident" },
      },
      {
        id: "update-2",
        ticketId,
        actorId: null,
        eventType: "EXPIRED",
        message: "Assignment expired.",
        createdAt: new Date("2026-01-01T11:00:00Z"),
        actor: null,
      },
    ];
    db.maintenanceTicket.findFirst.mockResolvedValue({ updates });
    const service = new TicketService(db as never);

    await expect(service.getUpdates(
      residentId,
      UserRole.RESIDENT,
      ticketId
    )).resolves.toEqual([
      { ...updates[0], source: "USER" },
      { ...updates[1], source: "SYSTEM" },
    ]);

    expect(db.maintenanceTicket.findFirst).toHaveBeenCalledWith({
      where: { id: ticketId, deletedAt: null, residentId },
      select: {
        updates: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: { actor: { select: { id: true, fullName: true } } },
        },
      },
    });
  });

  it("returns an empty update history for an accessible ticket", async () => {
    const db = database();
    db.maintenanceTicket.findFirst.mockResolvedValue({ updates: [] });
    const service = new TicketService(db as never);

    await expect(service.getUpdates(
      residentId,
      UserRole.RESIDENT,
      ticketId
    )).resolves.toEqual([]);
  });

  it("authorizes administrators for any visible ticket", async () => {
    const db = database();
    db.maintenanceTicket.findFirst.mockResolvedValue({ updates: [] });
    const service = new TicketService(db as never);

    await service.getUpdates(residentId, UserRole.ADMIN, ticketId);

    expect(db.maintenanceTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ticketId, deletedAt: null },
      })
    );
  });

  it("limits staff access to their currently active assignments", async () => {
    const db = database();
    db.maintenanceTicket.findFirst.mockResolvedValue({ updates: [] });
    const service = new TicketService(db as never);

    await service.getUpdates(residentId, UserRole.STAFF, ticketId);

    expect(db.maintenanceTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ticketId,
          deletedAt: null,
          assignments: {
            some: {
              staffId: residentId,
              status: {
                in: [
                  AssignmentStatus.AWAITING_RESPONSE,
                  AssignmentStatus.ACCEPTED,
                ],
              },
            },
          },
        },
      })
    );
  });

  it.each([UserRole.RESIDENT, UserRole.STAFF, UserRole.ADMIN])(
    "returns not found when a %s cannot access a missing or inaccessible ticket",
    async (role) => {
      const db = database();
      db.maintenanceTicket.findFirst.mockResolvedValue(null);
      const service = new TicketService(db as never);

      await expect(service.getUpdates(
        residentId,
        role,
        ticketId
      )).rejects.toMatchObject({
        statusCode: 404,
        code: "RESOURCE_NOT_FOUND",
      });
    }
  );

  it.each([AssignmentStatus.AWAITING_RESPONSE, AssignmentStatus.ACCEPTED])
  ("rejects updates with an active %s assignment", async (status) => {
    const db = database();

    db.maintenanceTicket.updateMany.mockResolvedValue({ count: 0 });
    db.maintenanceTicket.findFirst.mockResolvedValue({ id: ticketId });

    const service = new TicketService(db as never);

    await expect(service.update(
      residentId,
      ticketId,
      { title: "Changed" })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(db.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          assignments: {
            none: {
              status: {
                in: expect.arrayContaining([status])
              }
            }
          }
        })
      }));
  });

  it("updates an eligible pending ticket", async () => {
    const db = database();

    db.maintenanceTicket.updateMany.mockResolvedValue({
      count: 1
    });

    db.maintenanceTicket.findFirst.mockResolvedValue({
      id: ticketId,
      title: "Changed"
    });

    const service = new TicketService(db as never);

    await expect(service.update(
      residentId,
      ticketId,
      { title: "Changed" }
    )).resolves.toMatchObject({ title: "Changed" });
  });

  it("soft-deletes an eligible ticket without deleting historical records", async () => {
    const db = database();

    db.maintenanceTicket.updateMany.mockResolvedValue({ count: 1 });

    const service = new TicketService(db as never);

    await expect(service.delete(residentId, ticketId)).resolves.toBeUndefined();
    expect(db.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { deletedAt: expect.any(Date) }
      })
    );
  });

  it("rejects deletion for a non-pending ticket while retaining a 404 for unowned tickets", async () => {
    const db = database();

    db.maintenanceTicket.updateMany.mockResolvedValue({ count: 0 });
    db.maintenanceTicket.findFirst.mockResolvedValueOnce({ id: ticketId });

    const service = new TicketService(db as never);
    await expect(service.delete(residentId, ticketId)).rejects.toMatchObject({ statusCode: 409 });

    db.maintenanceTicket.findFirst.mockResolvedValueOnce(null);
    await expect(service.delete(residentId, ticketId)).rejects.toMatchObject({ statusCode: 404 });
  });
});

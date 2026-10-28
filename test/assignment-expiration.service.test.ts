import { AssignmentStatus } from "../src/generated/prisma/client.js";
import { AssignmentExpirationService } from "../src/services/assignment-expiration.service.js";

const assignmentId = "550e8400-e29b-41d4-a716-446655440021";
const ticketId = "550e8400-e29b-41d4-a716-446655440022";

function database() {
  const transaction = {
    ticketAssignment: { updateMany: jest.fn() },
    ticketUpdate: { create: jest.fn() },
  };
  const db = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction)),
    ticketAssignment: { findMany: jest.fn() },
  };
  return { db, transaction };
}

describe("AssignmentExpirationService", () => {
  it("expires due unanswered assignments and records system-authored history", async () => {
    const { db, transaction } = database();
    const now = new Date("2026-01-02T00:00:00.000Z");
    db.ticketAssignment.findMany.mockResolvedValue([{ id: assignmentId, ticketId }]);
    transaction.ticketAssignment.updateMany.mockResolvedValue({ count: 1 });
    const service = new AssignmentExpirationService(db as never);

    await expect(service.expireDueAssignments(now)).resolves.toBe(1);
    expect(db.ticketAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: AssignmentStatus.AWAITING_RESPONSE,
        responseDeadline: { lte: now },
      },
      take: 100,
    }));
    expect(transaction.ticketAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: assignmentId,
        status: AssignmentStatus.AWAITING_RESPONSE,
        responseDeadline: { lte: now },
      },
      data: { status: AssignmentStatus.EXPIRED, respondedAt: now },
    });
    expect(transaction.ticketUpdate.create).toHaveBeenCalledWith({
      data: {
        ticketId,
        actorId: null,
        eventType: "ASSIGNMENT_EXPIRED",
        message: expect.any(String),
      },
    });
  });

  it("does not overwrite an assignment already responded to", async () => {
    const { db, transaction } = database();
    db.ticketAssignment.findMany.mockResolvedValue([{ id: assignmentId, ticketId }]);
    transaction.ticketAssignment.updateMany.mockResolvedValue({ count: 0 });
    const service = new AssignmentExpirationService(db as never);

    await expect(service.expireDueAssignments()).resolves.toBe(0);
    expect(transaction.ticketUpdate.create).not.toHaveBeenCalled();
  });

  it("returns zero when there are no due assignments", async () => {
    const { db, transaction } = database();
    db.ticketAssignment.findMany.mockResolvedValue([]);
    const service = new AssignmentExpirationService(db as never);

    await expect(service.expireDueAssignments()).resolves.toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

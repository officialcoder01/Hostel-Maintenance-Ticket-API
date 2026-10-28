import {
  AssignmentStatus,
  Prisma,
  type PrismaClient
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

const expirationBatchSize = 100;

type AssignmentExpirationDatabase = Pick<PrismaClient, "$transaction"> & {
  ticketAssignment: Pick<PrismaClient["ticketAssignment"], "findMany">;
};

export class AssignmentExpirationService {
  constructor(
    private readonly database: AssignmentExpirationDatabase = prisma
  ) {}

  async expireDueAssignments(now = new Date()): Promise<number> {
    const dueAssignments = await this.database.ticketAssignment.findMany({
      where: {
        status: AssignmentStatus.AWAITING_RESPONSE,
        responseDeadline: { lte: now },
      },
      select: { id: true, ticketId: true },
      orderBy: [{ responseDeadline: "asc" }, { id: "asc" }],
      take: expirationBatchSize,
    });

    let expiredCount = 0;
    for (const assignment of dueAssignments) {
      const didExpire = await this.database.$transaction(async (transaction) => {
        const result = await transaction.ticketAssignment.updateMany({
          where: {
            id: assignment.id,
            status: AssignmentStatus.AWAITING_RESPONSE,
            responseDeadline: { lte: now },
          },
          data: {
            status: AssignmentStatus.EXPIRED,
            respondedAt: now,
          },
        });

        if (result.count === 0) {
          return false;
        }

        await transaction.ticketUpdate.create({
          data: {
            ticketId: assignment.ticketId,
            actorId: null,
            eventType: "ASSIGNMENT_EXPIRED",
            message: "The assignment expired because staff did not respond within 24 hours.",
          },
        });

        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (didExpire) {
        expiredCount += 1;
      }
    }

    return expiredCount;
  }
}

export const assignmentExpirationService = new AssignmentExpirationService();

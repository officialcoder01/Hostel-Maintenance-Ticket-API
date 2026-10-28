import {
  AssignmentStatus,
  Prisma,
  TicketStatus,
  UserRole,
  type PrismaClient
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type {
  AdminListTicketsQuery,
  AssignTicketInput,
  RejectTicketInput
} from "../validations/admin.validation.js";

type AdminTicketDatabase = Pick<PrismaClient, "$transaction"> & {
  maintenanceTicket: Pick<
    PrismaClient["maintenanceTicket"],
    "findMany" | "count" | "findFirst"
  >;
};

const activeAssignmentStatuses = [
  AssignmentStatus.AWAITING_RESPONSE,
  AssignmentStatus.ACCEPTED
];
const visibleTicket = { deletedAt: null };
const assignmentInfo = {
  orderBy: [{ assignedAt: "desc" as const }, { id: "desc" as const }],
  include: {
    staff: { select: { id: true, fullName: true, email: true } },
    assignedBy: { select: { id: true, fullName: true, email: true } },
  },
};
const ticketDetails = {
  resident: { select: { id: true, fullName: true, email: true } },
  hostel: { select: { id: true, name: true, address: true } },
  assignments: assignmentInfo,
  updates: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      actor: { select: { id: true, fullName: true, email: true } },
    },
  },
};

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2034";
}

function ticketEligibilityWhere(ticketId: string) {
  return {
    id: ticketId,
    status: TicketStatus.PENDING,
    ...visibleTicket,
    assignments: {
      none: {
        status: { in: activeAssignmentStatuses },
      },
    },
  };
}

function conflictError(): AppError {
  return new AppError(
    409,
    "TICKET_NOT_ELIGIBLE",
    "Ticket cannot be assigned or rejected in its current state."
  );
}

export class AdminTicketService {
  constructor(private readonly database: AdminTicketDatabase = prisma) {}

  async list(query: AdminListTicketsQuery) {
    const where = {
      ...visibleTicket,
      ...(query.status ? { status: query.status } : {}),
      ...(query.hostelId ? { hostelId: query.hostelId } : {}),
      ...(query.unassigned
        ? {
          status: TicketStatus.PENDING,
          assignments: {
            none: {
              status: { in: activeAssignmentStatuses },
            },
          },
        }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      this.database.maintenanceTicket.findMany({
        where,
        include: {
          resident: { select: { id: true, fullName: true, email: true } },
          assignments: assignmentInfo,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.maintenanceTicket.count({ where }),
    ]);

    return {
      data: tickets,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getById(ticketId: string) {
    const ticket = await this.database.maintenanceTicket.findFirst({
      where: { id: ticketId, ...visibleTicket },
      include: ticketDetails,
    });

    if (!ticket) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
    }

    return ticket;
  }

  async assign(adminId: string, ticketId: string, input: AssignTicketInput) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const eligibleTicket = await transaction.maintenanceTicket.findFirst({
          where: ticketEligibilityWhere(ticketId),
          select: { id: true },
        });

        if (!eligibleTicket) {
          await this.throwMissingOrConflict(transaction, ticketId);
        }

        const staff = await transaction.user.findFirst({
          where: { id: input.staffId, role: UserRole.STAFF },
          select: { id: true },
        });

        if (!staff) {
          throw new AppError(404, "RESOURCE_NOT_FOUND", "Staff user not found.");
        }

        const assignedAt = new Date();
        const responseDeadline = new Date(assignedAt.getTime() + 24 * 60 * 60 * 1_000);
        const claim = await transaction.maintenanceTicket.updateMany({
          where: ticketEligibilityWhere(ticketId),
          data: { updatedAt: assignedAt },
        });

        if (claim.count === 0) {
          throw conflictError();
        }

        const assignment = await transaction.ticketAssignment.create({
          data: {
            ticketId,
            staffId: staff.id,
            assignedById: adminId,
            status: AssignmentStatus.AWAITING_RESPONSE,
            assignedAt,
            responseDeadline,
            respondedAt: null,
          },
          include: {
            staff: { select: { id: true, fullName: true, email: true } },
            assignedBy: { select: { id: true, fullName: true, email: true } },
          },
        });

        await transaction.ticketUpdate.create({
          data: {
            ticketId,
            actorId: adminId,
            eventType: "ASSIGNED",
            message: `Ticket assigned to ${staff.id}.`,
          },
        });

        return assignment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw conflictError();
      }

      throw error;
    }
  }

  async reject(adminId: string, ticketId: string, input: RejectTicketInput) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const eligibleTicket = await transaction.maintenanceTicket.findFirst({
          where: ticketEligibilityWhere(ticketId),
          select: { id: true },
        });

        if (!eligibleTicket) {
          await this.throwMissingOrConflict(transaction, ticketId);
        }

        const rejectedAt = new Date();
        const updateResult = await transaction.maintenanceTicket.updateMany({
          where: ticketEligibilityWhere(ticketId),
          data: {
            status: TicketStatus.REJECTED,
            rejectionReason: input.reason,
            updatedAt: rejectedAt,
          },
        });

        if (updateResult.count === 0) {
          throw conflictError();
        }

        await transaction.ticketUpdate.create({
          data: {
            ticketId,
            actorId: adminId,
            eventType: "REJECTED",
            message: input.reason,
          },
        });

        const ticket = await transaction.maintenanceTicket.findFirst({
          where: { id: ticketId, ...visibleTicket },
          include: ticketDetails,
        });

        if (!ticket) {
          throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
        }

        return ticket;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw conflictError();
      }

      throw error;
    }
  }

  private async throwMissingOrConflict(
    transaction: Prisma.TransactionClient,
    ticketId: string
  ): Promise<never> {
    const ticket = await transaction.maintenanceTicket.findFirst({
      where: { id: ticketId, ...visibleTicket },
      select: { id: true },
    });

    if (!ticket) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
    }

    throw conflictError();
  }
}

export const adminTicketService = new AdminTicketService();

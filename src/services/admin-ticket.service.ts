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
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
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

/**
 * Service responsible for managing maintenance tickets from an admin perspective.
 */
export class AdminTicketService {
  constructor(private readonly database: AdminTicketDatabase = prisma) {}

  /**
   * Lists maintenance tickets based on the provided query parameters.
   * @param query - The query parameters for filtering and pagination.
   * @returns An object containing the list of tickets and pagination information.
   */
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

  /**
   * Retrieves a maintenance ticket by its ID.
   * @param ticketId - The ID of the ticket to retrieve.
   * @returns The maintenance ticket if found, otherwise throws an error.
   */
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

  /**
   * Assigns a maintenance ticket to a staff member.
   * @param adminId - The ID of the admin assigning the ticket.
   * @param ticketId - The ID of the ticket to assign.
   * @param input - The input parameters for the assignment.
   * @returns The assigned ticket assignment if successful, otherwise throws an error.
   */
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
        // Calculate the response deadline as 24 hours from the assignment time.
        const responseDeadline = new Date(assignedAt.getTime() + 24 * 60 * 60 * 1_000);

        // Update the maintenance ticket's updatedAt field to reflect the assignment action.
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

  /**
   * Rejects a maintenance ticket, marking it as rejected and logging the reason.
   * @param adminId - The ID of the admin rejecting the ticket.
   * @param ticketId - The ID of the ticket to reject.
   * @param input - The input parameters for the rejection.
   * @returns The rejected ticket if successful, otherwise throws an error.
   */
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

  /**
   * Helper method to throw an error if a ticket is missing or ineligible for assignment/rejection.
   * @param transaction - The Prisma transaction client.
   * @param ticketId - The ID of the ticket to check.
   * @throws AppError if the ticket is not found or ineligible.
   */
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

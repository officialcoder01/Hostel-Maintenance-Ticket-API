import {
  AssignmentStatus,
  Prisma,
  TicketStatus,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type {
  DeclineAssignmentInput,
  ResolveAssignmentInput,
  StaffListAssignmentsQuery,
} from "../validations/staff.validation.js";

type StaffAssignmentDatabase = Pick<PrismaClient, "$transaction"> & {
  ticketAssignment: Pick<
    PrismaClient["ticketAssignment"],
    "findMany" | "count"
  >;
};

const assignmentDetails = {
  ticket: {
    select: {
      id: true,
      title: true,
      description: true,
      locationDetails: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      resident: { select: { id: true, fullName: true } },
      hostel: { select: { id: true, name: true, address: true } },
    },
  },
};

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2034";
}

function conflictError(): AppError {
  return new AppError(
    409,
    "ASSIGNMENT_NOT_ELIGIBLE",
    "Assignment cannot be changed in its current state."
  );
}

/**
 * Manages assignments belonging to authenticated maintenance staff.
 */
export class StaffAssignmentService {
  constructor(private readonly database: StaffAssignmentDatabase = prisma) {}

  /**
   * Lists assignments for the authenticated staff member.
   * @param staffId - The ID of the authenticated staff member.
   * @param query - The filters and pagination options.
   * @returns Assignments with related ticket information and pagination.
   */
  async listMine(staffId: string, query: StaffListAssignmentsQuery) {
    const where = {
      staffId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [assignments, total] = await Promise.all([
      this.database.ticketAssignment.findMany({
        where,
        include: assignmentDetails,
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.ticketAssignment.count({ where }),
    ]);

    return {
      data: assignments,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Accepts an assignment and moves its ticket to in progress.
   * @param staffId - The ID of the authenticated staff member.
   * @param assignmentId - The ID of the assignment to accept.
   * @returns The updated assignment with ticket information.
   */
  async accept(staffId: string, assignmentId: string) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const assignment = await this.getOwnedAssignment(
          transaction,
          staffId,
          assignmentId
        );
        const now = new Date();

        if (
          assignment.status !== AssignmentStatus.AWAITING_RESPONSE
          || assignment.ticket.status !== TicketStatus.PENDING
          || assignment.ticket.deletedAt !== null
        ) {
          throw conflictError();
        }

        const assignmentUpdate = await transaction.ticketAssignment.updateMany({
          where: {
            id: assignmentId,
            staffId,
            status: AssignmentStatus.AWAITING_RESPONSE,
            responseDeadline: { gt: now },
          },
          data: {
            status: AssignmentStatus.ACCEPTED,
            respondedAt: now,
          },
        });

        if (assignmentUpdate.count === 0) {
          throw conflictError();
        }

        const ticketUpdate = await transaction.maintenanceTicket.updateMany({
          where: {
            id: assignment.ticketId,
            status: TicketStatus.PENDING,
            deletedAt: null,
          },
          data: { status: TicketStatus.IN_PROGRESS, updatedAt: now },
        });

        if (ticketUpdate.count === 0) {
          throw conflictError();
        }

        await transaction.ticketUpdate.create({
          data: {
            ticketId: assignment.ticketId,
            actorId: staffId,
            eventType: "ASSIGNMENT_ACCEPTED",
            message: "Assignment accepted.",
          },
        });

        return this.getAssignmentDetails(transaction, staffId, assignmentId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw conflictError();
      }

      throw error;
    }
  }

  /**
   * Declines an assignment and records the reason in ticket history.
   * @param staffId - The ID of the authenticated staff member.
   * @param assignmentId - The ID of the assignment to decline.
   * @param input - The required decline reason.
   * @returns The updated assignment with ticket information.
   */
  async decline(
    staffId: string,
    assignmentId: string,
    input: DeclineAssignmentInput
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const assignment = await this.getOwnedAssignment(
          transaction,
          staffId,
          assignmentId
        );
        const now = new Date();

        if (
          assignment.status !== AssignmentStatus.AWAITING_RESPONSE
          || assignment.ticket.status !== TicketStatus.PENDING
          || assignment.ticket.deletedAt !== null
        ) {
          throw conflictError();
        }

        const assignmentUpdate = await transaction.ticketAssignment.updateMany({
          where: {
            id: assignmentId,
            staffId,
            status: AssignmentStatus.AWAITING_RESPONSE,
            responseDeadline: { gt: now },
          },
          data: {
            status: AssignmentStatus.DECLINED,
            respondedAt: now,
          },
        });

        if (assignmentUpdate.count === 0) {
          throw conflictError();
        }

        const ticketUpdate = await transaction.maintenanceTicket.updateMany({
          where: {
            id: assignment.ticketId,
            status: TicketStatus.PENDING,
            deletedAt: null,
          },
          data: { updatedAt: now },
        });

        if (ticketUpdate.count === 0) {
          throw conflictError();
        }

        await transaction.ticketUpdate.create({
          data: {
            ticketId: assignment.ticketId,
            actorId: staffId,
            eventType: "ASSIGNMENT_DECLINED",
            message: input.reason,
          },
        });

        return this.getAssignmentDetails(transaction, staffId, assignmentId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw conflictError();
      }

      throw error;
    }
  }

  /**
   * Resolves an accepted assignment and its ticket.
   * @param staffId - The ID of the authenticated staff member.
   * @param assignmentId - The ID of the assignment to resolve.
   * @param input - The resolution message.
   * @returns The updated assignment with ticket information.
   */
  async resolve(
    staffId: string,
    assignmentId: string,
    input: ResolveAssignmentInput
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const assignment = await this.getOwnedAssignment(
          transaction,
          staffId,
          assignmentId
        );

        if (
          assignment.status !== AssignmentStatus.ACCEPTED
          || assignment.ticket.status !== TicketStatus.IN_PROGRESS
          || assignment.ticket.deletedAt !== null
        ) {
          throw conflictError();
        }

        const resolvedAt = new Date();
        const assignmentUpdate = await transaction.ticketAssignment.updateMany({
          where: {
            id: assignmentId,
            staffId,
            status: AssignmentStatus.ACCEPTED,
          },
          data: { status: AssignmentStatus.COMPLETED },
        });

        if (assignmentUpdate.count === 0) {
          throw conflictError();
        }

        const ticketUpdate = await transaction.maintenanceTicket.updateMany({
          where: {
            id: assignment.ticketId,
            status: TicketStatus.IN_PROGRESS,
            deletedAt: null,
          },
          data: {
            status: TicketStatus.RESOLVED,
            resolvedAt,
            updatedAt: resolvedAt,
          },
        });

        if (ticketUpdate.count === 0) {
          throw conflictError();
        }

        await transaction.ticketUpdate.create({
          data: {
            ticketId: assignment.ticketId,
            actorId: staffId,
            eventType: "RESOLVED",
            message: input.message,
          },
        });

        return this.getAssignmentDetails(transaction, staffId, assignmentId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw conflictError();
      }

      throw error;
    }
  }

  private async getOwnedAssignment(
    transaction: Prisma.TransactionClient,
    staffId: string,
    assignmentId: string
  ) {
    const assignment = await transaction.ticketAssignment.findFirst({
      where: { id: assignmentId },
      select: {
        id: true,
        staffId: true,
        ticketId: true,
        status: true,
        ticket: {
          select: { status: true, deletedAt: true },
        },
      },
    });

    if (!assignment) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Assignment not found.");
    }

    if (assignment.staffId !== staffId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You do not have permission to change this assignment."
      );
    }

    return assignment;
  }

  private async getAssignmentDetails(
    transaction: Prisma.TransactionClient,
    staffId: string,
    assignmentId: string
  ) {
    const assignment = await transaction.ticketAssignment.findFirst({
      where: { id: assignmentId, staffId },
      include: assignmentDetails,
    });

    if (!assignment) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Assignment not found.");
    }

    return assignment;
  }
}

export const staffAssignmentService = new StaffAssignmentService();

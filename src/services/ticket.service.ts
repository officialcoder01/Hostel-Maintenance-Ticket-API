import {
  AssignmentStatus,
  TicketStatus,
  type PrismaClient
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type {
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput
} from "../validations/ticket.validation.js";

type TicketDatabase = {
  hostel: Pick<PrismaClient["hostel"], "findUnique">;
  maintenanceTicket: Pick<
    PrismaClient["maintenanceTicket"],
    "create" | "findMany" | "count" | "findFirst" | "updateMany"
  >;
};

const activeAssignmentStatuses = [
  AssignmentStatus.AWAITING_RESPONSE,
  AssignmentStatus.ACCEPTED
];
const visibleTicket = { deletedAt: null };

/**
 * Service for managing maintenance tickets. Provides methods to create, 
 * list, retrieve, update, and delete tickets for authenticated residents.
 */
export class TicketService {
  constructor(private readonly database: TicketDatabase = prisma) {}

  /**
   * Creates a new maintenance ticket for the authenticated resident.
   * @param residentId - The ID of the authenticated resident.
   * @param input - The input data for creating the ticket.
   */
  async create(residentId: string, input: CreateTicketInput) {
    const hostel = await this.database.hostel.findUnique({
      where: {
        id: input.hostelId
      },
      select: { id: true }
    });

    if (!hostel) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Hostel not found.");
    }

    return this.database.maintenanceTicket.create({
      data: {
        ...input,
        residentId,
        status: TicketStatus.PENDING
      },
    });
  }

  /**
   * Lists maintenance tickets for the authenticated resident with pagination.
   * @param residentId - The ID of the authenticated resident.
   * @param query - The query parameters for listing tickets.
   */
  async listMine(residentId: string, query: ListTicketsQuery) {
    const where = {
      residentId,
      ...visibleTicket,
      ...(query.status ? { status: query.status } : {})
    };

    const [tickets, total] = await Promise.all([
      this.database.maintenanceTicket.findMany({
        where,
        orderBy: [
          {createdAt: "desc" },
          { id: "desc" }
        ],
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
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  /**
   * Retrieves a specific maintenance ticket for the authenticated resident.
   * @param residentId - The ID of the authenticated resident.
   * @param ticketId - The ID of the ticket to retrieve.
   */
  async getMine(residentId: string, ticketId: string) {
    const ticket = await this.database.maintenanceTicket.findFirst({
      where: {
        id: ticketId,
        residentId,
        ...visibleTicket
      },
    });

    if (!ticket) throw new AppError(
      404, "RESOURCE_NOT_FOUND", "Ticket not found."
    );

    return ticket;
  }

  /**
   * Updates a specific maintenance ticket for the authenticated resident.
   * @param residentId - The ID of the authenticated resident.
   * @param ticketId - The ID of the ticket to update.
   * @param input - The updated ticket information.
   */
  async update(
    residentId: string,
    ticketId: string,
    input: UpdateTicketInput
  ) {
    const update = await this.database.maintenanceTicket.updateMany({
      where: this.eligibleTicketWhere(residentId, ticketId),
      data: input,
    });

    if (update.count === 0) await this.throwMissingOrConflict(
      residentId,
      ticketId,
      "edited"
    );

    return this.getMine(residentId, ticketId);
  }

  /**
   * Deletes a specific maintenance ticket for the authenticated resident.
   * @param residentId - The ID of the authenticated resident.
   * @param ticketId - The ID of the ticket to delete.
   */
  async delete(residentId: string, ticketId: string) {
    const update = await this.database.maintenanceTicket.updateMany({
      where: this.eligibleTicketWhere(residentId, ticketId),
      data: { deletedAt: new Date() },
    });

    if (update.count === 0) await this.throwMissingOrConflict(
      residentId,
      ticketId,
      "deleted"
    );
  }

  /**
   * Constructs the criteria for finding an eligible ticket for update or deletion.
   * @param residentId - The ID of the authenticated resident.
   * @param ticketId - The ID of the ticket to check eligibility for.
   */
  private eligibleTicketWhere(residentId: string, ticketId: string) {
    return {
      id: ticketId,
      residentId,
      status: TicketStatus.PENDING,
      ...visibleTicket,
      assignments: {
        none: {
          status: {
            in: activeAssignmentStatuses
          }
        }
      },
    };
  }

  /**
   * Throws an error if the ticket is missing or not eligible for the requested action.
   * @param residentId - The ID of the authenticated resident.
   * @param ticketId - The ID of the ticket to check eligibility for.
   * @param action - The action being performed (edited or deleted).
   */
  private async throwMissingOrConflict(
    residentId: string,
    ticketId: string,
    action: "edited" | "deleted"
  ) {
    const ticket = await this.database.maintenanceTicket.findFirst({
      where: {
        id: ticketId,
        residentId,
        ...visibleTicket
      },
      select: { id: true },
    });

    if (!ticket) throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
    
    throw new AppError(409, "TICKET_NOT_ELIGIBLE", `Ticket cannot be ${action} in its current state.`);
  }
}

export const ticketService = new TicketService();

import { AssignmentStatus, TicketStatus, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from "../validations/ticket.validation.js";

type TicketDatabase = {
  hostel: Pick<PrismaClient["hostel"], "findUnique">;
  maintenanceTicket: Pick<
    PrismaClient["maintenanceTicket"],
    "create" | "findMany" | "count" | "findFirst" | "updateMany"
  >;
};

const activeAssignmentStatuses = [AssignmentStatus.AWAITING_RESPONSE, AssignmentStatus.ACCEPTED];
const visibleTicket = { deletedAt: null };

export class TicketService {
  constructor(private readonly database: TicketDatabase = prisma) {}

  async create(residentId: string, input: CreateTicketInput) {
    const hostel = await this.database.hostel.findUnique({ where: { id: input.hostelId }, select: { id: true } });
    if (!hostel) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Hostel not found.");
    }

    return this.database.maintenanceTicket.create({
      data: { ...input, residentId, status: TicketStatus.PENDING },
    });
  }

  async listMine(residentId: string, query: ListTicketsQuery) {
    const where = { residentId, ...visibleTicket, ...(query.status ? { status: query.status } : {}) };
    const [tickets, total] = await Promise.all([
      this.database.maintenanceTicket.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.maintenanceTicket.count({ where }),
    ]);

    return { data: tickets, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getMine(residentId: string, ticketId: string) {
    const ticket = await this.database.maintenanceTicket.findFirst({
      where: { id: ticketId, residentId, ...visibleTicket },
    });
    if (!ticket) throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
    return ticket;
  }

  async update(residentId: string, ticketId: string, input: UpdateTicketInput) {
    const update = await this.database.maintenanceTicket.updateMany({
      where: this.eligibleTicketWhere(residentId, ticketId),
      data: input,
    });
    if (update.count === 0) await this.throwMissingOrConflict(residentId, ticketId, "edited");
    return this.getMine(residentId, ticketId);
  }

  async delete(residentId: string, ticketId: string) {
    const update = await this.database.maintenanceTicket.updateMany({
      where: this.eligibleTicketWhere(residentId, ticketId),
      data: { deletedAt: new Date() },
    });
    if (update.count === 0) await this.throwMissingOrConflict(residentId, ticketId, "deleted");
  }

  private eligibleTicketWhere(residentId: string, ticketId: string) {
    return {
      id: ticketId,
      residentId,
      status: TicketStatus.PENDING,
      ...visibleTicket,
      assignments: { none: { status: { in: activeAssignmentStatuses } } },
    };
  }

  private async throwMissingOrConflict(residentId: string, ticketId: string, action: "edited" | "deleted") {
    const ticket = await this.database.maintenanceTicket.findFirst({
      where: { id: ticketId, residentId, ...visibleTicket },
      select: { id: true },
    });
    if (!ticket) throw new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
    throw new AppError(409, "TICKET_NOT_ELIGIBLE", `Ticket cannot be ${action} in its current state.`);
  }
}

export const ticketService = new TicketService();

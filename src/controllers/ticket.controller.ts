import type { RequestHandler } from "express";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdSchema,
  updateTicketSchema
} from "../validations/ticket.validation.js";
import {
  ticketService,
  type TicketService
} from "../services/ticket.service.js";

/**
 * Creates a ticket controller with the provided service.
 * @param service - The ticket service to use for handling ticket operations.
 * @returns An object containing the controller methods for ticket operations.
 */
export function createTicketController(service: TicketService = ticketService) {
  const requireResident = (request: Parameters<RequestHandler>[0]) => {
    if (!request.user) throw new Error("Authenticated user is required.");
    return request.user.id;
  };

  return {
    create: (async (request, response) => {
      const ticket = await service.create(
        requireResident(request),
        createTicketSchema.parse(request.body)
      );
      return response.status(201).json(ticket);
    }) satisfies RequestHandler,
    listMine: (async (request, response) => {
      return response.status(200).json(
        await service.listMine(
          requireResident(request),
          listTicketsQuerySchema.parse(request.query)
        )
      );
    }) satisfies RequestHandler,
    getMine: (async (request, response) => {
      const { id } = ticketIdSchema.parse(request.params);
      return response.status(200).json(
        await service.getMine(
          requireResident(request), id
        )
      );
    }) satisfies RequestHandler,
    update: (async (request, response) => {
      const { id } = ticketIdSchema.parse(request.params);
      return response.status(200).json(
        await service.update(
          requireResident(request), id, updateTicketSchema.parse(request.body)
        )
      );
    }) satisfies RequestHandler,
    delete: (async (request, response) => {
      const { id } = ticketIdSchema.parse(request.params);
      await service.delete(requireResident(request), id);
      return response.status(204).send();
    }) satisfies RequestHandler,
  };
}

import type { RequestHandler } from "express";
import {
  adminListTicketsQuerySchema,
  adminTicketIdSchema,
  assignTicketSchema,
  rejectTicketSchema
} from "../validations/admin.validation.js";
import {
  adminTicketService,
  type AdminTicketService
} from "../services/admin-ticket.service.js";

/**
 * Creates an admin ticket controller with the provided service.
 * @param service - The admin ticket service to use. Defaults to the default admin ticket service.
 * @returns An object containing the controller methods for handling admin ticket requests.
 */
export function createAdminTicketController(
  service: AdminTicketService = adminTicketService
) {
  const requireAdminId = (request: Parameters<RequestHandler>[0]) => {
    if (!request.user) throw new Error("Authenticated user is required.");
    return request.user.id;
  };

  return {
    list: (async (request, response) => {
      return response.status(200).json(
        await service.list(adminListTicketsQuerySchema.parse(request.query))
      );
    }) satisfies RequestHandler,
    getById: (async (request, response) => {
      const { id } = adminTicketIdSchema.parse(request.params);
      return response.status(200).json(await service.getById(id));
    }) satisfies RequestHandler,
    assign: (async (request, response) => {
      const { id } = adminTicketIdSchema.parse(request.params);
      const assignment = await service.assign(
        requireAdminId(request),
        id,
        assignTicketSchema.parse(request.body)
      );
      return response.status(201).json(assignment);
    }) satisfies RequestHandler,
    reject: (async (request, response) => {
      const { id } = adminTicketIdSchema.parse(request.params);
      return response.status(200).json(
        await service.reject(
          requireAdminId(request),
          id,
          rejectTicketSchema.parse(request.body)
        )
      );
    }) satisfies RequestHandler,
  };
}

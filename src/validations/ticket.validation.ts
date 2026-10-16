import { z } from "zod";

const uuid = z.uuid("Must be a valid UUID.");
const title = z.string().trim().min(1, "Title is required.").max(200);
const description = z.string().trim().min(1, "Description is required.").max(5_000);
const locationDetails = z.string().trim().min(1, "Location details are required.").max(300);

export const ticketIdSchema = z.object({ id: uuid }).strict();

export const createTicketSchema = z.object({
  hostelId: uuid,
  title,
  description,
  locationDetails,
}).strict();

export const updateTicketSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  locationDetails: locationDetails.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: "At least one field must be provided.",
});

export const listTicketsQuerySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

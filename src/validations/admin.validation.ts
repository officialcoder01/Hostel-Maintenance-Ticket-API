import { z } from "zod";

const uuid = z.uuid("Must be a valid UUID.");

export const adminTicketIdSchema = z.object({ id: uuid }).strict();

export const adminListTicketsQuerySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"]).optional(),
  hostelId: uuid.optional(),
  unassigned: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const assignTicketSchema = z.object({
  staffId: uuid,
}).strict();

export const rejectTicketSchema = z.object({
  reason: z.string().trim().min(1, "A rejection reason is required.").max(1_000),
}).strict();

export type AdminListTicketsQuery = z.infer<typeof adminListTicketsQuerySchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type RejectTicketInput = z.infer<typeof rejectTicketSchema>;

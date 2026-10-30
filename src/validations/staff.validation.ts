import { z } from "zod";

const uuid = z.uuid("Must be a valid UUID.");

export const staffAssignmentIdSchema = z.object({
  assignmentId: uuid,
}).strict();

export const staffListAssignmentsQuerySchema = z.object({
  status: z.enum([
    "AWAITING_RESPONSE",
    "ACCEPTED",
    "DECLINED",
    "EXPIRED",
    "COMPLETED",
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const declineAssignmentSchema = z.object({
  reason: z.string().trim().min(1, "A decline reason is required.").max(1_000),
}).strict();

export const resolveAssignmentSchema = z.object({
  message: z.string().trim().min(1, "A resolution message is required.").max(1_000),
}).strict();

export type StaffListAssignmentsQuery = z.infer<typeof staffListAssignmentsQuerySchema>;
export type DeclineAssignmentInput = z.infer<typeof declineAssignmentSchema>;
export type ResolveAssignmentInput = z.infer<typeof resolveAssignmentSchema>;

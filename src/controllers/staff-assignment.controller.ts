import type { RequestHandler } from "express";
import {
  declineAssignmentSchema,
  resolveAssignmentSchema,
  staffAssignmentIdSchema,
  staffListAssignmentsQuerySchema,
} from "../validations/staff.validation.js";
import {
  staffAssignmentService,
  type StaffAssignmentService,
} from "../services/staff-assignment.service.js";

export function createStaffAssignmentController(
  service: StaffAssignmentService = staffAssignmentService
) {
  const requireStaffId = (request: Parameters<RequestHandler>[0]) => {
    if (!request.user) throw new Error("Authenticated user is required.");
    return request.user.id;
  };

  return {
    listMine: (async (request, response) => {
      return response.status(200).json(
        await service.listMine(
          requireStaffId(request),
          staffListAssignmentsQuerySchema.parse(request.query)
        )
      );
    }) satisfies RequestHandler,
    accept: (async (request, response) => {
      const { assignmentId } = staffAssignmentIdSchema.parse(request.params);
      return response.status(200).json(
        await service.accept(requireStaffId(request), assignmentId)
      );
    }) satisfies RequestHandler,
    decline: (async (request, response) => {
      const { assignmentId } = staffAssignmentIdSchema.parse(request.params);
      return response.status(200).json(
        await service.decline(
          requireStaffId(request),
          assignmentId,
          declineAssignmentSchema.parse(request.body)
        )
      );
    }) satisfies RequestHandler,
    resolve: (async (request, response) => {
      const { assignmentId } = staffAssignmentIdSchema.parse(request.params);
      return response.status(200).json(
        await service.resolve(
          requireStaffId(request),
          assignmentId,
          resolveAssignmentSchema.parse(request.body)
        )
      );
    }) satisfies RequestHandler,
  };
}

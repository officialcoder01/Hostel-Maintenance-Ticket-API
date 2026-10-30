import { Router } from "express";
import { UserRole } from "../generated/prisma/client.js";
import { createStaffAssignmentController } from "../controllers/staff-assignment.controller.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import type { StaffAssignmentService } from "../services/staff-assignment.service.js";

export function createStaffRouter(service?: StaffAssignmentService) {
  const router = Router();
  const controller = createStaffAssignmentController(service);

  router.use(authenticate, requireRole(UserRole.STAFF));
  router.get("/assignments", controller.listMine);
  router.patch("/assignments/:assignmentId/accept", controller.accept);
  router.patch("/assignments/:assignmentId/decline", controller.decline);
  router.patch("/assignments/:assignmentId/resolve", controller.resolve);

  return router;
}

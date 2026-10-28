import { Router } from "express";
import { UserRole } from "../generated/prisma/client.js";
import { createAdminTicketController } from "../controllers/admin-ticket.controller.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import type { AdminTicketService } from "../services/admin-ticket.service.js";

export function createAdminRouter(service?: AdminTicketService) {
  const router = Router();
  const controller = createAdminTicketController(service);

  router.use(authenticate, requireRole(UserRole.ADMIN));
  router.get("/tickets", controller.list);
  router.get("/tickets/:id", controller.getById);
  router.patch("/tickets/:id/assignments", controller.assign);
  router.patch("/tickets/:id/rejection", controller.reject);

  return router;
}

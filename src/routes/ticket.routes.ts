import { Router } from "express";
import { UserRole } from "../generated/prisma/client.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { createTicketController, } from "../controllers/ticket.controller.js";
import type { TicketService } from "../services/ticket.service.js";

export function createTicketRouter(service?: TicketService) {
  const router = Router();
  const controller = createTicketController(service);
  
  router.use(authenticate, requireRole(UserRole.RESIDENT));
  router.post("/", controller.create);
  router.get("/mine", controller.listMine);
  router.get("/:id", controller.getMine);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.delete);
  return router;
}
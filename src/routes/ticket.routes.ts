import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { UserRole } from "../generated/prisma/client.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { createTicketController, } from "../controllers/ticket.controller.js";
import type { TicketService } from "../services/ticket.service.js";

const ticketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    status: 429,
    error: "TOO_MANY_REQUESTS",
    message: "Too many requests, please try again after 15 minutes."
  },
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

export function createTicketRouter(service?: TicketService) {
  const router = Router();
  const controller = createTicketController(service);
  
  router.use(authenticate);
  router.get("/:id/updates", controller.getUpdates);

  router.use(requireRole(UserRole.RESIDENT));
  router.post("/", ticketLimiter, controller.create);
  router.get("/mine", controller.listMine);
  router.get("/:id", controller.getMine);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.delete);
  return router;
}
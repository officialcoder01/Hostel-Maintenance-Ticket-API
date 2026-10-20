import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthService } from "../services/auth.service.js";

export function createAuthRouter(service?: AuthService) {
  const router = Router();
  const controller = createAuthController(service);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.get("/me", authenticate, controller.me);

  return router;
}

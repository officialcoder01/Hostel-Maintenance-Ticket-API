import { Router } from "express";
import { authLimiter } from "../middleware/rate-limit.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthService } from "../services/auth.service.js";

export function createAuthRouter(service?: AuthService) {
  const router = Router();
  const controller = createAuthController(service);

  router.post("/register", authLimiter, controller.register);
  router.post("/login", authLimiter, controller.login);
  router.get("/me", authenticate, controller.me);

  return router;
}

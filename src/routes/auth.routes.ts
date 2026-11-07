import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createAuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthService } from "../services/auth.service.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    status: 429,
    error: "TOO_MANY_REQUESTS",
    message: "Too many requests, please try again after 15 minutes."
  },
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

export function createAuthRouter(service?: AuthService) {
  const router = Router();
  const controller = createAuthController(service);

  router.post("/register", authLimiter, controller.register);
  router.post("/login", authLimiter, controller.login);
  router.get("/me", authenticate, controller.me);

  return router;
}

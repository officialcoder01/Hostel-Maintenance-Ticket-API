import type { RequestHandler } from "express";
import {
  loginSchema,
  registerSchema
} from "../validations/auth.validation.js";
import {
  authService,
  type AuthService
} from "../services/auth.service.js";

/**
 * Creates handlers for public authentication endpoints and the current user.
 */
export function createAuthController(service: AuthService = authService) {
  const requireUser = (request: Parameters<RequestHandler>[0]) => {
    if (!request.user) throw new Error("Authenticated user is required.");
    return request.user;
  };

  return {
    register: (async (request, response) => {
      const user = await service.register(registerSchema.parse(request.body));
      return response.status(201).json(user);
    }) satisfies RequestHandler,
    login: (async (request, response) => {
      const result = await service.login(loginSchema.parse(request.body));
      return response.status(200).json(result);
    }) satisfies RequestHandler,
    me: (async (request, response) => {
      const user = await service.getCurrentUser(requireUser(request).id);
      return response.status(200).json(user);
    }) satisfies RequestHandler,
  };
}

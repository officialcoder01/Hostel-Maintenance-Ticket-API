import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { UserRole } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && Object.values(UserRole).some((role) => role === value);
}

/**
 * Middleware to authenticate requests using JWT tokens.
 * It verifies the token and attaches the user information to the request object.
 * If authentication fails, it passes an error to the next middleware.
 */
export function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
  ? authorization.slice(7)
  : undefined;

  const secret = process.env.JWT_SECRET;

  if (!token) {
    next(new AppError(401, "UNAUTHENTICATED", "Authentication is required."));
    return;
  }

  if (!secret) {
    next(new AppError(500, "CONFIGURATION_ERROR", "JWT authentication is not configured."));
    return;
  }

  try {
    const payload = jwt.verify(token, secret);
    
    if (typeof payload === "string" || !isValidPayload(payload)) {
      throw new Error("Invalid token payload");
    }

    request.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired authentication token."));
  }
}

function isValidPayload(payload: JwtPayload): payload is JwtPayload & { sub: string; role: UserRole } {
  return typeof payload.sub === "string" && isUserRole(payload.role);
}

export function requireRole(role: UserRole) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.user?.role !== role) {
      next(new AppError(403, "FORBIDDEN", "You do not have permission to access this resource."));
      return;
    }
    next();
  };
}

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  type PrismaClient,
  UserRole
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type {
  LoginInput,
  RegisterInput
} from "../validations/auth.validation.js";

type AuthDatabase = {
  user: Pick<PrismaClient["user"], "create" | "findUnique">;
};

const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
};

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2002";
}

/**
 * Service for registering users and issuing credentials for authentication.
 */
export class AuthService {
  constructor(private readonly database: AuthDatabase = prisma) {}

  /**
   * Registers a new user and returns their information.
   * @param input - The input data for registering a new user.
   */
  async register(input: RegisterInput) {
    const existingUser = await this.database.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email already exists.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await this.database.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
          role: UserRole.RESIDENT,
        },
        select: safeUserSelect,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email already exists.");
      }

      throw error;
    }
  }

  /**
   * Authenticates a user and returns an access token along with user information.
   * @param input - The input data for logging in.
   */
  async login(input: LoginInput) {
    const user = await this.database.user.findUnique({
      where: { email: input.email },
      select: {
        ...safeUserSelect,
        passwordHash: true,
      },
    });

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    return {
      accessToken: this.createAccessToken(user.id, user.role),
      user: this.toSafeUser(user),
    };
  }

  /**
   * Retrieves the currently authenticated user based on their user ID.
   * @param userId - The ID of the authenticated user.
   */
  async getCurrentUser(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    });

    if (!user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }

    return user;
  }

  /**
   * Creates a JWT access token for the authenticated user.
   * @param userId - The ID of the authenticated user.
   * @param role - The role of the authenticated user.
   */
  private createAccessToken(userId: string, role: UserRole): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new AppError(500, "CONFIGURATION_ERROR", "JWT authentication is not configured.");
    }

    return jwt.sign({ sub: userId, role }, secret, { expiresIn: "1h" });
  }

  /**
   * Converts a user object to a safe user object, excluding sensitive information.
   * @param user - The user object to convert.
   */
  private toSafeUser(user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }
}

export const authService = new AuthService();

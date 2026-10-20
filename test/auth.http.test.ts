import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../src/errors/app-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAuthRouter } from "../src/routes/auth.routes.js";
import { AuthService } from "../src/services/auth.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440020";

function appWithService() {
  const service = Object.create(AuthService.prototype) as AuthService;
  service.register = jest.fn().mockResolvedValue({
    id: userId,
    fullName: "Jane Resident",
    email: "jane@example.com",
    role: "RESIDENT"
  });
  service.login = jest.fn().mockResolvedValue({
    accessToken: jwt.sign(
      { sub: userId, role: "RESIDENT" },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    ),
    user: {
      id: userId,
      fullName: "Jane Resident",
      email: "jane@example.com",
      role: "RESIDENT"
    }
  });
  service.getCurrentUser = jest.fn().mockResolvedValue({
    id: userId,
    fullName: "Jane Resident",
    email: "jane@example.com",
    role: "RESIDENT"
  });

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(service));
  app.use(errorHandler);
  return { app, service };
}

describe("authentication HTTP endpoints", () => {
  it("registers a resident with the documented response shape", async () => {
    const { app, service } = appWithService();

    await request(app).post("/api/auth/register").send({
      fullName: "Jane Resident",
      email: "JANE@EXAMPLE.COM",
      password: "SecurePass123"
    }).expect(201).expect(({ body }) => {
      expect(body).toEqual({
        id: userId,
        fullName: "Jane Resident",
        email: "jane@example.com",
        role: "RESIDENT"
      });
      expect(body).not.toHaveProperty("passwordHash");
    });

    expect(service.register).toHaveBeenCalledWith({
      fullName: "Jane Resident",
      email: "jane@example.com",
      password: "SecurePass123"
    });
  });

  it("rejects invalid registration and login bodies before calling services", async () => {
    const { app, service } = appWithService();

    await request(app).post("/api/auth/register").send({
      fullName: "",
      email: "bad-email",
      password: "short",
      role: "ADMIN"
    }).expect(400).expect(({ body }) => {
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    await request(app).post("/api/auth/login").send({
      email: "jane@example.com"
    }).expect(400);

    expect(service.register).not.toHaveBeenCalled();
    expect(service.login).not.toHaveBeenCalled();
  });

  it("returns duplicate-email and invalid-credential errors without leaking account details", async () => {
    const { app, service } = appWithService();
    jest.spyOn(service, "register").mockRejectedValue(
      new AppError(409, "EMAIL_ALREADY_EXISTS", "Email already exists.")
    );
    jest.spyOn(service, "login").mockRejectedValue(
      new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.")
    );

    await request(app).post("/api/auth/register").send({
      fullName: "Jane Resident",
      email: "jane@example.com",
      password: "SecurePass123"
    }).expect(409).expect(({ body }) => {
      expect(body.error).toEqual({
        code: "EMAIL_ALREADY_EXISTS",
        message: "Email already exists."
      });
    });

    for (const email of ["unknown@example.com", "jane@example.com"]) {
      await request(app).post("/api/auth/login").send({
        email,
        password: "WrongPass123"
      }).expect(401).expect(({ body }) => {
        expect(body.error).toEqual({
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password."
        });
      });
    }
  });

  it("logs in and accepts the returned token on the protected current-user route", async () => {
    const { app, service } = appWithService();
    const login = await request(app).post("/api/auth/login").send({
      email: "jane@example.com",
      password: "SecurePass123"
    }).expect(200);

    await request(app).get("/api/auth/me").set(
      "Authorization",
      `Bearer ${login.body.accessToken}`
    ).expect(200).expect(({ body }) => {
      expect(body).toEqual(login.body.user);
      expect(body).not.toHaveProperty("passwordHash");
    });

    expect(service.getCurrentUser).toHaveBeenCalledWith(userId);
  });

  it("rejects missing, malformed, invalid, and expired tokens", async () => {
    const { app } = appWithService();
    const secret = process.env.JWT_SECRET as string;
    const expiredToken = jwt.sign(
      { sub: userId, role: "RESIDENT" },
      secret,
      { expiresIn: "-1s" }
    );

    for (const token of ["not-a-token", "wrong-secret", expiredToken]) {
      const authorization = token === "wrong-secret"
        ? `Bearer ${jwt.sign({ sub: userId, role: "RESIDENT" }, "wrong-secret")}`
        : `Bearer ${token}`;

      await request(app).get("/api/auth/me").set(
        "Authorization",
        authorization
      ).expect(401).expect(({ body }) => {
        expect(body.error.code).toBe("UNAUTHENTICATED");
      });
    }

    await request(app).get("/api/auth/me").expect(401);
  });
});

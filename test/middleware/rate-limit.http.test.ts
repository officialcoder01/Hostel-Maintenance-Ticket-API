import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../src/app.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createAuthRouter } from "../../src/routes/auth.routes.js";
import { createTicketRouter } from "../../src/routes/ticket.routes.js";
import { AuthService } from "../../src/services/auth.service.js";
import { TicketService } from "../../src/services/ticket.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const hostelId = "550e8400-e29b-41d4-a716-446655440003";

function authApp() {
  const service = Object.create(AuthService.prototype) as AuthService;
  service.register = jest.fn().mockResolvedValue({
    id: userId,
    fullName: "Jane Resident",
    email: "jane@example.com",
    role: "RESIDENT"
  });

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(service));
  app.use(errorHandler);
  return { app, service };
}

function ticketApp() {
  const service = Object.create(TicketService.prototype) as TicketService;
  service.create = jest.fn().mockResolvedValue({
    id: "ticket",
    residentId: userId,
    status: "PENDING"
  });

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/tickets", createTicketRouter(service));
  app.use(errorHandler);
  return { app, service };
}

function registration() {
  return {
    fullName: "Jane Resident",
    email: "jane@example.com",
    password: "SecurePass123"
  };
}

function ticketCreation() {
  return {
    hostelId,
    title: "Tap",
    description: "Leaks",
    locationDetails: "A1"
  };
}

function residentAuthorization() {
  const token = jwt.sign(
    { sub: userId, role: "RESIDENT" },
    process.env.JWT_SECRET as string
  );
  return `Bearer ${token}`;
}

function expectRateLimitHeaders(headers: Record<string, string | undefined>) {
  expect(headers.ratelimit).toBeDefined();
  expect(headers["ratelimit-policy"]).toBeDefined();
  expect(headers["x-ratelimit-limit"]).toBeUndefined();
}

describe("rate limiting HTTP behavior", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows the configured auth limit, rejects the next request, and tracks clients independently", async () => {
    const { app, service } = authApp();
    let firstResponse;

    for (let count = 0; count < 7; count += 1) {
      firstResponse = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "198.51.100.10")
        .send(registration());
      expect(firstResponse.status).toBe(201);
    }

    expectRateLimitHeaders(firstResponse!.headers);

    const limitedResponse = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", "198.51.100.10")
      .send(registration())
      .expect(429);
    expect(limitedResponse.body).toMatchObject({
      status: 429,
      error: "TOO_MANY_REQUESTS"
    });
    expectRateLimitHeaders(limitedResponse.headers);

    await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", "198.51.100.11")
      .send(registration())
      .expect(201);

    expect(service.register).toHaveBeenCalledTimes(8);
  });

  it("allows the configured ticket-creation limit and returns 429 after it", async () => {
    const { app, service } = ticketApp();
    let firstResponse;

    for (let count = 0; count < 20; count += 1) {
      firstResponse = await request(app)
        .post("/api/tickets")
        .set("X-Forwarded-For", "198.51.100.20")
        .set("Authorization", residentAuthorization())
        .send(ticketCreation());
      expect(firstResponse.status).toBe(201);
    }

    expectRateLimitHeaders(firstResponse!.headers);

    const limitedResponse = await request(app)
      .post("/api/tickets")
      .set("X-Forwarded-For", "198.51.100.20")
      .set("Authorization", residentAuthorization())
      .send(ticketCreation())
      .expect(429);
    expect(limitedResponse.body).toMatchObject({
      status: 429,
      error: "TOO_MANY_REQUESTS"
    });
    expectRateLimitHeaders(limitedResponse.headers);
    expect(service.create).toHaveBeenCalledTimes(20);
  });

  it("allows the configured global limit and returns 429 after it", async () => {
    let firstResponse;

    for (let count = 0; count < 100; count += 1) {
      firstResponse = await request(app)
        .get("/")
        .set("X-Forwarded-For", "198.51.100.30");
      expect(firstResponse.status).toBe(200);
    }

    expectRateLimitHeaders(firstResponse!.headers);

    const limitedResponse = await request(app)
      .get("/")
      .set("X-Forwarded-For", "198.51.100.30")
      .expect(429);
    expect(limitedResponse.body).toMatchObject({
      status: 429,
      error: "TOO_MANY_REQUESTS"
    });
    expectRateLimitHeaders(limitedResponse.headers);
  });

  it("allows normal requests again after the auth rate-limit window resets", async () => {
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval"]
    });
    const { app } = authApp();
    const clientIp = "198.51.100.40";

    for (let count = 0; count < 7; count += 1) {
      await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", clientIp)
        .send(registration())
        .expect(201);
    }

    await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", clientIp)
      .send(registration())
      .expect(429);

    jest.setSystemTime(Date.now() + 15 * 60 * 1000 + 1);

    const response = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", clientIp)
      .send(registration())
      .expect(201);
    expectRateLimitHeaders(response.headers);
  });
});

import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../src/errors/app-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createTicketRouter } from "../src/routes/ticket.routes.js";
import { TicketService } from "../src/services/ticket.service.js";

const residentId = "550e8400-e29b-41d4-a716-446655440001";
const hostelId = "550e8400-e29b-41d4-a716-446655440003";
const ticketId = "550e8400-e29b-41d4-a716-446655440004";

function token(role: "RESIDENT" | "ADMIN" | "STAFF", userId = residentId) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET as string);
}

function appWithService() {
  const service = Object.create(TicketService.prototype) as TicketService;

  service.create = jest.fn().mockResolvedValue({
    id: "ticket",
    residentId,
    status: "PENDING"
  });

  service.listMine = jest.fn().mockResolvedValue({
    data: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0
    }
  });

  service.getMine = jest.fn().mockResolvedValue({
    id: "ticket",
    residentId
  });

  service.getUpdates = jest.fn().mockResolvedValue([
    {
      id: "update",
      ticketId,
      actorId: null,
      eventType: "EXPIRED",
      message: null,
      createdAt: "2026-01-01T10:00:00.000Z",
      actor: null,
      source: "SYSTEM",
    },
  ]);

  service.update = jest.fn().mockResolvedValue({
    id: "ticket",
    title: "Changed"
  });

  service.delete = jest.fn().mockResolvedValue(undefined);

  const app = express();
  app.use(express.json());
  app.use("/api/tickets", createTicketRouter(service));
  app.use(errorHandler);
  return { app, service };
}

describe("ticket HTTP endpoints", () => {
  it("rejects missing authentication", async () => {
    const { app } = appWithService();
    await request(app).get("/api/tickets/mine").expect(401).expect(({
      body
    }) => expect(body.error.code).toBe("UNAUTHENTICATED"));
  });

  it.each(["RESIDENT", "ADMIN", "STAFF"] as const)(
    "returns ticket updates for the authenticated %s",
    async (role) => {
      const userId = role === "RESIDENT" ? residentId : `${role}-user`;
      const { app, service } = appWithService();

      await request(app)
        .get(`/api/tickets/${ticketId}/updates?role=ADMIN&residentId=forged`)
        .set("Authorization", `Bearer ${token(role, userId)}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(1);
          expect(body[0]).toMatchObject({
            ticketId,
            actorId: null,
            actor: null,
            source: "SYSTEM",
          });
        });

      expect(service.getUpdates).toHaveBeenCalledWith(userId, role, ticketId);
    }
  );

  it("validates the ticket ID and hides inaccessible ticket histories", async () => {
    const { app, service } = appWithService();
    const authorization = `Bearer ${token("RESIDENT")}`;

    await request(app)
      .get("/api/tickets/not-a-uuid/updates")
      .set("Authorization", authorization)
      .expect(400);
    expect(service.getUpdates).not.toHaveBeenCalled();

    jest.spyOn(service, "getUpdates").mockRejectedValueOnce(
      new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.")
    );
    await request(app)
      .get(`/api/tickets/${ticketId}/updates`)
      .set("Authorization", authorization)
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
      });
  });

  it("creates a ticket for the JWT resident", async () => {
    const { app, service } = appWithService();

    await request(app).post("/api/tickets").set("Authorization", `Bearer ${token("RESIDENT")}`).send({
      hostelId,
      title: "Tap",
      description: "Leaks",
      locationDetails: "A1"
    }).expect(201);

    expect(service.create).toHaveBeenCalledWith(
      residentId,
      expect.objectContaining({
        hostelId
      })
    );
  });

  it("returns validation errors before calling the service", async () => {
    const { app, service } = appWithService();

    await request(app).patch("/api/tickets/not-a-uuid").set("Authorization", `Bearer ${token("RESIDENT")}`).send({ status: "RESOLVED" }).expect(400).expect(({
      body
    }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
    
    expect(service.update).not.toHaveBeenCalled();
  });

  it("lists, updates, and soft-deletes through the protected routes", async () => {
    const { app, service } = appWithService();

    await request(app).get(
      "/api/tickets/mine?status=PENDING&page=1&limit=10"
    ).set(
      "Authorization", `Bearer ${token("RESIDENT")}`
    ).expect(200);

    await request(app).patch(
      `/api/tickets/${hostelId}`
    ).set(
      "Authorization", `Bearer ${token("RESIDENT")}`
    ).send({
      title: "Changed"
    }).expect(200);

    await request(app).delete(
      `/api/tickets/${hostelId}`
    ).set(
      "Authorization", `Bearer ${token("RESIDENT")}`
    ).expect(204);

    expect(service.listMine).toHaveBeenCalledWith(
      residentId,
      expect.objectContaining({
        status: "PENDING",
        limit: 10
      })
    );
    
    expect(service.update).toHaveBeenCalled();
    expect(service.delete).toHaveBeenCalled();
  });
});

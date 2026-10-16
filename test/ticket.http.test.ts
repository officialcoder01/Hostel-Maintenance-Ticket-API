import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createTicketRouter } from "../src/routes/ticket.routes.js";
import { TicketService } from "../src/services/ticket.service.js";

const residentId = "550e8400-e29b-41d4-a716-446655440001";
const hostelId = "550e8400-e29b-41d4-a716-446655440003";
const token = jwt.sign({ sub: residentId, role: "RESIDENT" }, process.env.JWT_SECRET as string);

function appWithService() {
  const service = Object.create(TicketService.prototype) as TicketService;
  service.create = jest.fn().mockResolvedValue({ id: "ticket", residentId, status: "PENDING" });
  service.listMine = jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  service.getMine = jest.fn().mockResolvedValue({ id: "ticket", residentId });
  service.update = jest.fn().mockResolvedValue({ id: "ticket", title: "Changed" });
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
    await request(app).get("/api/tickets/mine").expect(401).expect(({ body }) => expect(body.error.code).toBe("UNAUTHENTICATED"));
  });

  it("creates a ticket for the JWT resident", async () => {
    const { app, service } = appWithService();
    await request(app).post("/api/tickets").set("Authorization", `Bearer ${token}`).send({ hostelId, title: "Tap", description: "Leaks", locationDetails: "A1" }).expect(201);
    expect(service.create).toHaveBeenCalledWith(residentId, expect.objectContaining({ hostelId }));
  });

  it("returns validation errors before calling the service", async () => {
    const { app, service } = appWithService();
    await request(app).patch("/api/tickets/not-a-uuid").set("Authorization", `Bearer ${token}`).send({ status: "RESOLVED" }).expect(400).expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
    expect(service.update).not.toHaveBeenCalled();
  });

  it("lists, updates, and soft-deletes through the protected routes", async () => {
    const { app, service } = appWithService();
    await request(app).get("/api/tickets/mine?status=PENDING&page=1&limit=10").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app).patch(`/api/tickets/${hostelId}`).set("Authorization", `Bearer ${token}`).send({ title: "Changed" }).expect(200);
    await request(app).delete(`/api/tickets/${hostelId}`).set("Authorization", `Bearer ${token}`).expect(204);
    expect(service.listMine).toHaveBeenCalledWith(residentId, expect.objectContaining({ status: "PENDING", limit: 10 }));
    expect(service.update).toHaveBeenCalled();
    expect(service.delete).toHaveBeenCalled();
  });
});

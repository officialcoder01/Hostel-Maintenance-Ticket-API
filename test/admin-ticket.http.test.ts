import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../src/errors/app-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminRouter } from "../src/routes/admin.routes.js";
import { AdminTicketService } from "../src/services/admin-ticket.service.js";

const adminId = "550e8400-e29b-41d4-a716-446655440011";
const ticketId = "550e8400-e29b-41d4-a716-446655440012";
const staffId = "550e8400-e29b-41d4-a716-446655440013";

function appWithService() {
  const service = Object.create(AdminTicketService.prototype) as AdminTicketService;
  service.list = jest.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  service.getById = jest.fn().mockResolvedValue({ id: ticketId });
  service.assign = jest.fn().mockResolvedValue({ id: "assignment" });
  service.reject = jest.fn().mockResolvedValue({ id: ticketId, status: "REJECTED" });

  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter(service));
  app.use(errorHandler);
  return { app, service };
}

function token(role: "ADMIN" | "RESIDENT") {
  return jwt.sign({ sub: adminId, role }, process.env.JWT_SECRET as string);
}

describe("admin ticket HTTP endpoints", () => {
  it("rejects unauthenticated and non-admin requests", async () => {
    const { app, service } = appWithService();

    await request(app).get("/api/admin/tickets").expect(401);
    await request(app).get("/api/admin/tickets").set(
      "Authorization", `Bearer ${token("RESIDENT")}`
    ).expect(403);

    expect(service.list).not.toHaveBeenCalled();
  });

  it("allows admins to list tickets and validates filters", async () => {
    const { app, service } = appWithService();

    await request(app).get("/api/admin/tickets?status=PENDING&unassigned=true&page=2&limit=5")
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(200);
    expect(service.list).toHaveBeenCalledWith({
      status: "PENDING",
      unassigned: true,
      page: 2,
      limit: 5,
    });

    await request(app).get("/api/admin/tickets?unassigned=maybe")
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(400);
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it("returns ticket detail and uses the service 404 for missing tickets", async () => {
    const { app, service } = appWithService();

    await request(app).get(`/api/admin/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(200);
    expect(service.getById).toHaveBeenCalledWith(ticketId);

    jest.spyOn(service, "getById").mockRejectedValueOnce(
      new AppError(404, "RESOURCE_NOT_FOUND", "Ticket not found.")
    );
    await request(app).get(`/api/admin/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(404);
  });

  it("validates and dispatches assignment and rejection requests", async () => {
    const { app, service } = appWithService();

    await request(app).patch(`/api/admin/tickets/${ticketId}/assignments`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .send({ staffId })
      .expect(201);
    expect(service.assign).toHaveBeenCalledWith(adminId, ticketId, { staffId });

    await request(app).patch(`/api/admin/tickets/${ticketId}/assignments`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .send({ staffId: "not-a-uuid" })
      .expect(400);

    await request(app).patch(`/api/admin/tickets/${ticketId}/rejection`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .send({ reason: " Duplicate report " })
      .expect(200);
    expect(service.reject).toHaveBeenCalledWith(
      adminId, ticketId, { reason: "Duplicate report" }
    );

    await request(app).patch(`/api/admin/tickets/${ticketId}/rejection`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .send({})
      .expect(400);
  });
});

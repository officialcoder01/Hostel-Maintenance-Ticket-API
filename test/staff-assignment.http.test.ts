import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../src/errors/app-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createStaffRouter } from "../src/routes/staff.routes.js";
import { StaffAssignmentService } from "../src/services/staff-assignment.service.js";

const staffId = "550e8400-e29b-41d4-a716-446655440041";
const assignmentId = "550e8400-e29b-41d4-a716-446655440042";

function appWithService() {
  const service = Object.create(StaffAssignmentService.prototype) as StaffAssignmentService;
  service.listMine = jest.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  service.accept = jest.fn().mockResolvedValue({ id: assignmentId, status: "ACCEPTED" });
  service.decline = jest.fn().mockResolvedValue({ id: assignmentId, status: "DECLINED" });
  service.resolve = jest.fn().mockResolvedValue({ id: assignmentId, status: "COMPLETED" });

  const app = express();
  app.use(express.json());
  app.use("/api/staff", createStaffRouter(service));
  app.use(errorHandler);
  return { app, service };
}

function token(role: "STAFF" | "RESIDENT" | "ADMIN") {
  return jwt.sign({ sub: staffId, role }, process.env.JWT_SECRET as string);
}

describe("staff assignment HTTP endpoints", () => {
  it("requires authentication and the STAFF role", async () => {
    const { app, service } = appWithService();

    await request(app).get("/api/staff/assignments").expect(401);
    await request(app).get("/api/staff/assignments")
      .set("Authorization", `Bearer ${token("RESIDENT")}`)
      .expect(403);
    await request(app).get("/api/staff/assignments")
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(403);
    expect(service.listMine).not.toHaveBeenCalled();
  });

  it("lists own assignments and validates query parameters", async () => {
    const { app, service } = appWithService();

    await request(app).get("/api/staff/assignments?status=ACCEPTED&page=2&limit=5")
      .set("Authorization", `Bearer ${token("STAFF")}`)
      .expect(200);
    expect(service.listMine).toHaveBeenCalledWith(staffId, {
      status: "ACCEPTED",
      page: 2,
      limit: 5,
    });

    await request(app).get("/api/staff/assignments?status=INVALID")
      .set("Authorization", `Bearer ${token("STAFF")}`)
      .expect(400);
    expect(service.listMine).toHaveBeenCalledTimes(1);
  });

  it("dispatches accept, decline, and resolve actions with validated inputs", async () => {
    const { app, service } = appWithService();
    const authorization = `Bearer ${token("STAFF")}`;

    await request(app).patch(`/api/staff/assignments/${assignmentId}/accept`)
      .set("Authorization", authorization)
      .expect(200);
    expect(service.accept).toHaveBeenCalledWith(staffId, assignmentId);

    await request(app).patch(`/api/staff/assignments/${assignmentId}/decline`)
      .set("Authorization", authorization)
      .send({ reason: "  I am unavailable.  " })
      .expect(200);
    expect(service.decline).toHaveBeenCalledWith(staffId, assignmentId, {
      reason: "I am unavailable.",
    });

    await request(app).patch(`/api/staff/assignments/${assignmentId}/resolve`)
      .set("Authorization", authorization)
      .send({ message: "  Repair complete.  " })
      .expect(200);
    expect(service.resolve).toHaveBeenCalledWith(staffId, assignmentId, {
      message: "Repair complete.",
    });
  });

  it("rejects invalid IDs and missing or empty action data", async () => {
    const { app, service } = appWithService();
    const authorization = `Bearer ${token("STAFF")}`;

    await request(app).patch("/api/staff/assignments/not-a-uuid/accept")
      .set("Authorization", authorization)
      .expect(400);
    await request(app).patch(`/api/staff/assignments/${assignmentId}/decline`)
      .set("Authorization", authorization)
      .send({})
      .expect(400);
    await request(app).patch(`/api/staff/assignments/${assignmentId}/resolve`)
      .set("Authorization", authorization)
      .send({ message: "   " })
      .expect(400);

    expect(service.accept).not.toHaveBeenCalled();
    expect(service.decline).not.toHaveBeenCalled();
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it("returns service ownership and state errors using the standard error shape", async () => {
    const { app, service } = appWithService();
    const authorization = `Bearer ${token("STAFF")}`;
    jest.spyOn(service, "accept").mockRejectedValueOnce(
      new AppError(403, "FORBIDDEN", "Assignment belongs to another staff member.")
    );

    await request(app).patch(`/api/staff/assignments/${assignmentId}/accept`)
      .set("Authorization", authorization)
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe("FORBIDDEN"));
  });
});

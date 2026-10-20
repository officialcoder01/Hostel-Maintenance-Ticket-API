import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserRole } from "../src/generated/prisma/client.js";
import { AuthService } from "../src/services/auth.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440010";

function database() {
  return {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe("AuthService", () => {
  it("registers a resident with a password hash and safe response", async () => {
    const db = database();
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockImplementation(async ({ data }) => ({
      id: userId,
      fullName: data.fullName,
      email: data.email,
      role: data.role,
    }));

    const service = new AuthService(db as never);
    const user = await service.register({
      fullName: "Jane Resident",
      email: "jane@example.com",
      password: "SecurePass123"
    });

    const createData = db.user.create.mock.calls[0][0].data;
    expect(createData.role).toBe(UserRole.RESIDENT);
    expect(createData.passwordHash).not.toBe("SecurePass123");
    await expect(bcrypt.compare("SecurePass123", createData.passwordHash)).resolves.toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate email", async () => {
    const db = database();
    db.user.findUnique.mockResolvedValue({ id: userId });
    const service = new AuthService(db as never);

    await expect(service.register({
      fullName: "Jane Resident",
      email: "jane@example.com",
      password: "SecurePass123"
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "EMAIL_ALREADY_EXISTS"
    });
  });

  it("returns identical invalid-credential errors for unknown email and bad password", async () => {
    const db = database();
    const service = new AuthService(db as never);

    db.user.findUnique.mockResolvedValue(null);
    const unknownEmail = service.login({
      email: "unknown@example.com",
      password: "SecurePass123"
    });

    const passwordHash = await bcrypt.hash("CorrectPass123", 12);
    db.user.findUnique.mockResolvedValue({
      id: userId,
      fullName: "Jane Resident",
      email: "jane@example.com",
      role: UserRole.RESIDENT,
      passwordHash,
    });
    const incorrectPassword = service.login({
      email: "jane@example.com",
      password: "WrongPass123"
    });

    await expect(unknownEmail).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password."
    });
    await expect(incorrectPassword).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password."
    });
  });

  it("creates a JWT with the claims used by authentication middleware", async () => {
    const db = database();
    const passwordHash = await bcrypt.hash("SecurePass123", 12);
    db.user.findUnique.mockResolvedValue({
      id: userId,
      fullName: "Jane Resident",
      email: "jane@example.com",
      role: UserRole.RESIDENT,
      passwordHash,
    });

    const service = new AuthService(db as never);
    const result = await service.login({
      email: "jane@example.com",
      password: "SecurePass123"
    });
    const payload = jwt.verify(result.accessToken, process.env.JWT_SECRET as string);

    expect(payload).toMatchObject({ sub: userId, role: UserRole.RESIDENT });
    expect(result.user).not.toHaveProperty("passwordHash");
  });
});

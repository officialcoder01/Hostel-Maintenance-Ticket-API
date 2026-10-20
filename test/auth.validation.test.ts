import {
  loginSchema,
  registerSchema
} from "../src/validations/auth.validation.js";

describe("authentication validation", () => {
  it("accepts and normalizes a valid resident registration", () => {
    expect(registerSchema.parse({
      fullName: "  Jane Resident  ",
      email: " JANE@EXAMPLE.COM ",
      password: "SecurePass123"
    })).toEqual({
      fullName: "Jane Resident",
      email: "jane@example.com",
      password: "SecurePass123"
    });
  });

  it("rejects incomplete, invalid, and role-supplied registration bodies", () => {
    expect(() => registerSchema.parse({
      fullName: "",
      email: "not-an-email",
      password: "short"
    })).toThrow();

    for (const role of ["ADMIN", "STAFF"]) {
      expect(() => registerSchema.parse({
        fullName: "Jane Resident",
        email: "jane@example.com",
        password: "SecurePass123",
        role
      })).toThrow();
    }
  });

  it("requires a valid email and password for login", () => {
    expect(() => loginSchema.parse({
      email: "invalid",
      password: "short"
    })).toThrow();
    expect(() => loginSchema.parse({ email: "jane@example.com" })).toThrow();
  });
});

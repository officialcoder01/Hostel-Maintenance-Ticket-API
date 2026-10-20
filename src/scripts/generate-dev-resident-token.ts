import "dotenv/config";
import jwt from "jsonwebtoken";
import { UserRole } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

function getEmailArgument(): string {
  const [email, ...extraArguments] = process.argv.slice(2);

  if (!email || extraArguments.length > 0) {
    throw new Error("Usage: npm run dev:token -- resident@example.com");
  }

  return email.trim().toLowerCase();
}

async function generateToken(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can run only when NODE_ENV is set to development.");
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }

  const email = getEmailArgument();
  const resident = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!resident) {
    throw new Error("No user exists with that email address.");
  }

  if (resident.role !== UserRole.RESIDENT) {
    throw new Error("A development token can be created only for a RESIDENT user.");
  }

  const token = jwt.sign(
    { sub: resident.id, role: resident.role },
    secret,
    { expiresIn: "1h" },
  );

  console.log(`Resident ID: ${resident.id}`);
  console.log(`Token (expires in 1 hour): ${token}`);
}

try {
  await generateToken();
} catch (error) {
  const message = error instanceof Error
  ? error.message
  : "Unable to generate a development token.";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

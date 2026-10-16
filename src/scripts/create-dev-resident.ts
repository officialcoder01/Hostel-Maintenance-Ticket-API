import "dotenv/config";
import bcrypt from "bcrypt";
import { UserRole } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

function getUserArguments(): { fullName: string; email: string } {
  const [fullName, email, ...extraArguments] = process.argv.slice(2);

  if (!fullName || !email || extraArguments.length > 0) {
    throw new Error('Usage: npm run dev:create-resident -- "Full Name" resident@example.com');
  }

  const normalizedFullName = fullName.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedFullName) {
    throw new Error("Full name is required.");
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error("A valid email address is required.");
  }

  return { fullName: normalizedFullName, email: normalizedEmail };
}

async function promptForPassword(): Promise<string> {
  process.stdout.write("Password (minimum 8 characters): ");

  return new Promise((resolve, reject) => {
    let password = "";

    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.setRawMode?.(true);

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(password);
          return;
        }

        if (character === "\u0003") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          reject(new Error("Password entry cancelled."));
          return;
        }

        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
          continue;
        }

        password += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function createResident(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can run only when NODE_ENV is set to development.");
  }

  const { fullName, email } = getUserArguments();
  const password = await promptForPassword();

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error("A user with that email address already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const resident = await prisma.user.create({
    data: { fullName, email, passwordHash, role: UserRole.RESIDENT },
    select: { id: true, fullName: true, email: true, role: true },
  });

  console.log(`Created resident: ${resident.fullName} (${resident.email})`);
  console.log(`Resident ID: ${resident.id}`);
}

try {
  await createResident();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unable to create the development resident.";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

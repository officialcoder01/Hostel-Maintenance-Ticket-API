import "dotenv/config";
import { prisma } from "../lib/prisma.js";

function getHostelArguments(): { name: string; address: string } {
  const [name, address, ...extraArguments] = process.argv.slice(2);

  if (!name || !address || extraArguments.length > 0) {
    throw new Error('Usage: npm run dev:create-hostel -- "Hostel Name" "Hostel Address"');
  }

  const normalizedName = name.trim();
  const normalizedAddress = address.trim();

  if (!normalizedName) {
    throw new Error("Hostel name is required.");
  }

  if (!normalizedAddress) {
    throw new Error("Hostel address is required.");
  }

  return { name: normalizedName, address: normalizedAddress };
}

async function createHostel(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can run only when NODE_ENV is set to development.");
  }

  const { name, address } = getHostelArguments();
  const hostel = await prisma.hostel.create({
    data: { name, address },
    select: { id: true, name: true, address: true },
  });

  console.log(`Created hostel: ${hostel.name}`);
  console.log(`Address: ${hostel.address}`);
  console.log(`Hostel ID: ${hostel.id}`);
}

try {
  await createHostel();
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : "Unable to create the development hostel.";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

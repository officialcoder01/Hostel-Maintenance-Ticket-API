import { assignmentExpirationService } from "../services/assignment-expiration.service.js";
import { prisma } from "../lib/prisma.js";

try {
  const expiredCount = await assignmentExpirationService.expireDueAssignments();
  console.log(`Expired ${expiredCount} assignment(s).`);
} finally {
  await prisma.$disconnect();
}

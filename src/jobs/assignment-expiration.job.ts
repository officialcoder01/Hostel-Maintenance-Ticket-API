import cron from "node-cron";
import { assignmentExpirationService } from "../services/assignment-expiration.service.js";

export async function runAssignmentExpirationJob(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.info(`[job:assignment-expiration] Started at ${startedAt}.`);

  try {
    const expiredCount = await assignmentExpirationService.expireDueAssignments();
    console.info(
      `[job:assignment-expiration] Finished. Expired ${expiredCount} assignment(s).`
    );
  } catch (error) {
    console.error("[job:assignment-expiration] Failed to expire assignments.", error);
  }
}

export function startAssignmentExpirationJob(): void {
  cron.schedule("0 * * * *", runAssignmentExpirationJob, {
    name: "assignment-expiration",
    noOverlap: true,
  });
  console.info("[job:assignment-expiration] Scheduled to run at the start of every hour.");
}

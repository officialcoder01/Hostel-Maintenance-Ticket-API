import cron from "node-cron";
import { assignmentExpirationService } from "../src/services/assignment-expiration.service.js";
import {
  runAssignmentExpirationJob,
  startAssignmentExpirationJob
} from "../src/jobs/assignment-expiration.job.js";

describe("assignment expiration job", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("schedules the job at the start of every hour", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    startAssignmentExpirationJob();

    const task = Array.from(cron.getTasks().values())
      .find((scheduledTask) => scheduledTask.name === "assignment-expiration");

    if (!task) {
      throw new Error("Assignment expiration task was not scheduled.");
    }

    try {
      expect(task.getPattern()).toBe("0 * * * *");
      expect(info).toHaveBeenCalledWith(
        "[job:assignment-expiration] Scheduled to run at the start of every hour."
      );
    } finally {
      await task.destroy();
    }
  });

  it("logs the run and the number of expired assignments", async () => {
    jest.spyOn(assignmentExpirationService, "expireDueAssignments")
      .mockResolvedValue(2);
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

    await runAssignmentExpirationJob();

    expect(assignmentExpirationService.expireDueAssignments).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[job:assignment-expiration\] Started at .+\.$/)
    );
    expect(info).toHaveBeenCalledWith(
      "[job:assignment-expiration] Finished. Expired 2 assignment(s)."
    );
  });

  it("logs a failure and allows later scheduled runs to continue", async () => {
    const error = new Error("database unavailable");
    jest.spyOn(assignmentExpirationService, "expireDueAssignments")
      .mockRejectedValue(error);
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runAssignmentExpirationJob()).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      "[job:assignment-expiration] Failed to expire assignments.",
      error
    );
  });
});

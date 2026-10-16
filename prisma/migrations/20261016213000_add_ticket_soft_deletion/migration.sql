ALTER TABLE "MaintenanceTicket" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "MaintenanceTicket_deletedAt_idx" ON "MaintenanceTicket"("deletedAt");

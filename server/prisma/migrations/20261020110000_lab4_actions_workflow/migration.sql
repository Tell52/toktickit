-- PostgreSQL DDL is transactional only when explicitly enclosed. A failed
-- preflight or later constraint must not leave a half-upgraded Lab 3 database.
BEGIN;

-- Maintenance window: stop application writers before deployment. Hold this
-- lock through preflight/backfill so no unreviewed aliases enter during upgrade.
LOCK TABLE "Ticket" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE invalid_ids TEXT;
BEGIN
    SELECT string_agg("id"::TEXT, ', ' ORDER BY "id") INTO invalid_ids
    FROM "Ticket"
    WHERE replace(lower(btrim("currentStatus")), '_', ' ') NOT IN
        ('new', 'open', 'in progress', 'waiting for requester', 'resolved', 'closed', 'reopened', 'cancelled')
       OR lower(btrim("requestedPriority")) NOT IN ('low', 'medium', 'high')
       OR ("itPriority" IS NOT NULL AND lower(btrim("itPriority")) NOT IN ('low', 'medium', 'high'));
    IF invalid_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Lab 4 preflight: unknown status/priority on Ticket ids: %. Review source data before retrying.', invalid_ids;
    END IF;
END $$;

-- Accepted aliases: case-insensitive canonical labels and underscore forms of
-- multiword statuses; priorities accept case variants. No spelling synonyms.
-- Raw SQL deliberately preserves updatedAt and all other historical columns.
UPDATE "Ticket" SET
    "currentStatus" = CASE replace(lower(btrim("currentStatus")), '_', ' ')
        WHEN 'new' THEN 'New' WHEN 'open' THEN 'Open'
        WHEN 'in progress' THEN 'In Progress'
        WHEN 'waiting for requester' THEN 'Waiting for Requester'
        WHEN 'resolved' THEN 'Resolved' WHEN 'closed' THEN 'Closed'
        WHEN 'reopened' THEN 'Reopened' WHEN 'cancelled' THEN 'Cancelled' END,
    "requestedPriority" = initcap(lower(btrim("requestedPriority"))),
    "itPriority" = initcap(lower(btrim("itPriority")));

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolutionCycle" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" UUID NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "resolutionCycle" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "performedById" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "cancellationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTakenRevision" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "ActionTakenRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusEvent" (
    "id" UUID NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "resolutionCycle" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCreateRequest" (
    "id" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" UUID NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionCreateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_resolutionCycle_status_idx" ON "ActionTaken"("ticketId", "resolutionCycle", "status");

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_assigneeId_status_actionAt_id_idx" ON "ActionTaken"("assigneeId", "status", "actionAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTakenRevision_actionId_revision_key" ON "ActionTakenRevision"("actionId", "revision");

-- CreateIndex
CREATE INDEX "TicketStatusEvent_ticketId_createdAt_id_idx" ON "TicketStatusEvent"("ticketId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ActionCreateRequest_ticketId_idx" ON "ActionCreateRequest"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCreateRequest_actorId_key_key" ON "ActionCreateRequest"("actorId", "key");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_currentStatus_idx" ON "Ticket"("requesterId", "currentStatus");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_updatedAt_id_idx" ON "Ticket"("requesterId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_resolvedAt_id_idx" ON "Ticket"("requesterId", "resolvedAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_ownerId_currentStatus_idx" ON "Ticket"("ownerId", "currentStatus");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_itPriority_idx" ON "Ticket"("currentStatus", "itPriority");

-- CreateIndex
CREATE INDEX "Ticket_updatedAt_id_idx" ON "Ticket"("updatedAt", "id");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TicketStatusEvent" ADD CONSTRAINT "TicketStatusEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TicketStatusEvent" ADD CONSTRAINT "TicketStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionCreateRequest" ADD CONSTRAINT "ActionCreateRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ActionCreateRequest" ADD CONSTRAINT "ActionCreateRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma schema cannot express CHECK constraints. Keep these in migration SQL
-- and verify them against PostgreSQL in migration-regression.test.ts.
ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_version_positive" CHECK ("version" >= 1),
    ADD CONSTRAINT "Ticket_resolutionCycle_positive" CHECK ("resolutionCycle" >= 1);

ALTER TABLE "ActionTaken"
    ADD CONSTRAINT "ActionTaken_version_positive" CHECK ("version" >= 1),
    ADD CONSTRAINT "ActionTaken_resolutionCycle_positive" CHECK ("resolutionCycle" >= 1),
    ADD CONSTRAINT "ActionTaken_description_valid" CHECK (
        char_length("description") BETWEEN 1 AND 2000 AND "description" !~ '^[[:space:]]*$'),
    ADD CONSTRAINT "ActionTaken_result_valid" CHECK (
        ("result" IS NULL OR char_length("result") <= 2000) AND
        ("status" <> 'COMPLETED' OR ("result" IS NOT NULL AND "result" !~ '^[[:space:]]*$'))),
    ADD CONSTRAINT "ActionTaken_followUp_valid" CHECK (
        (NOT "followUpRequired" AND "followUpNote" IS NULL) OR
        ("followUpRequired" AND "followUpNote" IS NOT NULL AND
            char_length("followUpNote") BETWEEN 1 AND 1000 AND "followUpNote" !~ '^[[:space:]]*$')),
    ADD CONSTRAINT "ActionTaken_attachmentNotes_length" CHECK (char_length("attachmentNotes") <= 1000),
    ADD CONSTRAINT "ActionTaken_cancellation_valid" CHECK (
        ("status" <> 'CANCELLED' AND "cancellationReason" IS NULL) OR
        ("status" = 'CANCELLED' AND "cancellationReason" IS NOT NULL AND
            char_length("cancellationReason") BETWEEN 1 AND 1000 AND "cancellationReason" !~ '^[[:space:]]*$'));

ALTER TABLE "ActionTakenRevision"
    ADD CONSTRAINT "ActionTakenRevision_revision_positive" CHECK ("revision" >= 1),
    ADD CONSTRAINT "ActionTakenRevision_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object');

ALTER TABLE "TicketStatusEvent"
    ADD CONSTRAINT "TicketStatusEvent_cycle_positive" CHECK ("resolutionCycle" >= 1),
    ADD CONSTRAINT "TicketStatusEvent_status_valid" CHECK (
        "fromStatus" IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened', 'Cancelled') AND
        "toStatus" IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened', 'Cancelled') AND
        "fromStatus" <> "toStatus"),
    ADD CONSTRAINT "TicketStatusEvent_reason_valid" CHECK (
        ("toStatus" <> 'Cancelled' AND "reason" IS NULL) OR
        ("toStatus" = 'Cancelled' AND "reason" IS NOT NULL AND
            char_length("reason") BETWEEN 1 AND 1000 AND "reason" !~ '^[[:space:]]*$'));

ALTER TABLE "ActionCreateRequest"
    ADD CONSTRAINT "ActionCreateRequest_hash_valid" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ActionCreateRequest_response_object" CHECK (jsonb_typeof("response") = 'object');

COMMIT;

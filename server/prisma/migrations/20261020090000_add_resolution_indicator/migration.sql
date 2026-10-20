-- Persist the requester resolution indicator defined by the Lab 3 schema.
ALTER TABLE "Ticket"
ADD COLUMN "problemAppearsResolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "indicatedAt" TIMESTAMP(3);

-- Read-only Lab 3 inventory and actionable alias diagnostics. Run with
-- psql --set ON_ERROR_STOP=1 --file prisma/preflight-lab4.sql
-- before deploy; the migration repeats the check under its Ticket lock.
SELECT 'Category' AS entity, count(*) AS rows FROM "Category"
UNION ALL
SELECT 'RelatedSystem' AS entity, count(*) AS rows FROM "RelatedSystem"
UNION ALL
SELECT 'User' AS entity, count(*) AS rows FROM "User"
UNION ALL
SELECT 'Ticket' AS entity, count(*) AS rows FROM "Ticket"
UNION ALL
SELECT 'Attachment' AS entity, count(*) AS rows FROM "Attachment"
UNION ALL
SELECT 'Comment' AS entity, count(*) AS rows FROM "Comment"
UNION ALL
SELECT 'Note' AS entity, count(*) AS rows FROM "Note";

SELECT "id", "currentStatus", "requestedPriority", "itPriority"
FROM "Ticket"
WHERE replace(lower(btrim("currentStatus")), '_', ' ') NOT IN
    ('new', 'open', 'in progress', 'waiting for requester', 'resolved', 'closed', 'reopened', 'cancelled')
   OR lower(btrim("requestedPriority")) NOT IN ('low', 'medium', 'high')
   OR ("itPriority" IS NOT NULL AND lower(btrim("itPriority")) NOT IN ('low', 'medium', 'high'))
ORDER BY "id";

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

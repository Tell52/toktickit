# Lab 4 Database Migration and Recovery

**Issue:** [#43](https://github.com/Tell52/toktickit/issues/43)

**Migration:** `20261020110000_lab4_actions_workflow`

**Contracts:** [Specification, section 7](specification.md#7-data-changes-migration-and-seed), [test plan](tests.md).

## Schema and compatibility

- Add `ActionStatus`, `ActionTaken`, `ActionTakenRevision`, `TicketStatusEvent` and `ActionCreateRequest`. Each action has one required Ticket FK, separate performer/assignee User FKs, timestamps and a positive version/cycle. Action cycle is explicitly supplied from the locked Ticket; it has no silent cycle-1 default.
- Existing Ticket IDs stay integers and existing User IDs stay text, including any legacy non-UUID identifiers. New record IDs and idempotency keys are PostgreSQL UUIDs. JSON snapshots/responses use JSONB; the normalized request hash is lowercase SHA-256 hex.
- Add Ticket `version=1`, `resolutionCycle=1`, `resolvedAt=null`. Do not infer a resolution timestamp from updatedAt, fabricate action/history rows or change the requester advisory fields.
- Preserve all existing tables, IDs, relationships, password hashes, attachment metadata/removal state and business timestamps. New User/Ticket/history references use restrictive FKs; account activation/role changes preserve history.
- Normalize only case variants of the eight canonical Ticket statuses, underscore forms of multiword statuses and case variants of Low/Medium/High, after trimming outer spaces. Null IT Priority remains null. Unknown values stop the migration and require a reviewed source-data correction. No spelling synonyms such as `Canceled` are assumed.
- Include the query indexes in specification section 7.1 and an additional receipt Ticket FK index. CHECK constraints enforce positive counters, text bounds/required completion and cancellation evidence, conditional follow-up notes, object-shaped JSON, receipt hash shape and canonical event status labels. These custom checks live in migration SQL because Prisma 5 cannot express them in its schema.

The migration encloses preflight, normalization, DDL and backfill in one PostgreSQL transaction and locks Ticket writes while it runs. Deploy in a maintenance window. Do not edit earlier migration files or use `prisma db push` as a substitute for this migration.

This issue provides database support. Following service issues must enforce authenticated identities, immutable action identity/cycle, active-staff eligibility, date/trim validation, append-only audit APIs, the full transition matrix, resolution gates, shared Ticket locking and atomic audit/version/receipt writes. A direct Prisma update does not automatically increment the version or append history. The database test of conditional updates is not evidence that those future APIs already enforce concurrency.

## Before upgrading a working database

1. Stop application writers and identify the exact Lab 3 application revision to restore if necessary. Inventory the database and attachment files. Keep the application's configuration/secret material separately and securely.
2. Make a custom-format PostgreSQL backup and copy actual attachment storage to a separate backup directory. Verify the backup by restoring it into a new disposable database before changing the working database. Use a PostgreSQL client version compatible with the server; the verified rehearsal uses PostgreSQL 16 tools/server.
3. Configure Prisma `DATABASE_URL` and PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` for the same target. Authenticate with the normal password prompt or a protected `PGPASSFILE`; do not put credentials into evidence. Prisma's `?schema=public` URL parameter is not a libpq connection option, so do not pass that URL unchanged to psql/pg_dump.
4. From `server`, run the read-only preflight below and save its counts and diagnostics. Review any unknown status/priority against source records rather than silently mapping it to a default.

Example PowerShell, after configuring those environment variables and creating a backup directory outside the checkout:

~~~powershell
# Choose an unused destination; protect these files because they contain user data.
$backupRoot = 'E:\toktickit-backups\lab4-before-upgrade'
New-Item -ItemType Directory -Path $backupRoot -ErrorAction Stop | Out-Null
psql --set ON_ERROR_STOP=1 --file prisma/preflight-lab4.sql --output "$backupRoot\preflight.txt"
if ($LASTEXITCODE -ne 0) { throw 'Resolve preflight diagnostics before deployment.' }
pg_dump --format=custom --no-owner --no-acl --file "$backupRoot\lab3.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
pg_restore --list "$backupRoot\lab3.dump" | Set-Content "$backupRoot\backup-contents.txt"
if ($LASTEXITCODE -ne 0) { throw 'Backup cannot be read.' }
~~~

Copy the actual attachment directory separately and record SHA-256 hashes before/after copying, using `Get-FileHash`. Inspect the baseline uploader before choosing that directory: the current Lab 3 route uses Multer memory storage and stores a generated `/uploads/...` URL without persisting uploaded bytes. A database backup preserves that metadata; it cannot recover bytes that were never stored. The automated rehearsal uses a synthetic file to verify the storage-copy/hash procedure. It does not claim to repair the existing upload subsystem.

## Deploy and verify

From `server`, with `DATABASE_URL` pointing to the verified target:

~~~powershell
npm ci
npx prisma validate
if ($LASTEXITCODE -ne 0) { throw 'Schema validation failed.' }
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'Client generation failed.' }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; follow recovery procedure.' }
npx prisma migrate status
if ($LASTEXITCODE -ne 0) { throw 'Migration status requires review.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
~~~

Compare the original IDs, counts, relationships and row values against the pre-upgrade snapshot. Only the documented aliases and new default/null fields should differ. Confirm the four new tables are empty before adding actual work or dedicated Lab 4 fixtures, verify legacy reads and check attachment metadata/file hashes. Existing Resolved/Closed Tickets have unknown `resolvedAt=null`; they must not acquire invented recent-resolution metrics. New Lab 4 demonstration seeds belong to issue #44.

## Failure and recovery

### Failed migration

The explicit transaction rolls back both DDL and normalized values. First verify that the new tables/columns are absent and old row values match the snapshot. Prisma may retain a failed row in `_prisma_migrations`. Prisma 5 can show `current transaction is aborted` instead of the first SQL diagnostic; run the read-only `preflight-lab4.sql` to obtain offending Ticket IDs, and inspect database logs for other failures.

After correcting the verified cause and confirming rollback, reconcile the failed migration record, then retry:

~~~powershell
npx prisma migrate resolve --rolled-back 20261020110000_lab4_actions_workflow
if ($LASTEXITCODE -ne 0) { throw 'Migration ledger requires review.' }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Retry failed.' }
~~~

Use `resolve --rolled-back` only for a verified failed, fully rolled-back deployment. It does not undo schema/data and is not a rollback command for a successfully applied migration.

### Restore after successful deployment

Prefer a forward correction. If returning to Lab 3 is necessary:

1. Stop all writers. Back up the **post-upgrade database and attachment storage first**, even if the application is faulty. Restore that backup into a separate archive database and compare its action/history/receipt data; do not discard new work.
2. Restore the verified pre-upgrade dump into a **new empty database**, keeping the upgraded database available for reconciliation. Set `PGDATABASE` to that new database before using `pg_restore --no-owner --no-acl --exit-on-error --single-transaction <backup.dump>`.
3. Restore attachment storage into a separate directory and verify hashes. Compare all seven legacy tables, IDs/relationships/password hashes and sequences to the pre-upgrade inventory. Test legacy reads with the matching Lab 3 application revision.
4. Point the matching application at the restored database/storage only after verification. Reconcile post-upgrade writes from the retained archive before resuming service. Application rollback alone cannot restore previous workflow semantics.

Do not drop the Lab 4 tables to simulate recovery, run `prisma migrate reset` against a working database, mark a failed migration applied, or restore over the sole copy of current data.

## Reproducible automated rehearsal

The suite creates uniquely named `toktickit_lab4_<32 hex>` databases on an explicitly supplied disposable PostgreSQL server. It never reads `DATABASE_URL` as its target and drops only the databases it created. The base URL requires database-creation privileges. Backups and a synthetic attachment copy live in a unique OS temporary directory and are removed after verification; these test artifacts contain synthetic data only.

For a local Docker rehearsal, from `server`:

~~~powershell
docker run --detach --rm --name toktickit-lab4-migration-test --publish 127.0.0.1::5432 --env POSTGRES_USER=lab4 --env POSTGRES_PASSWORD=lab4-test-only --env POSTGRES_DB=postgres postgres:16
if ($LASTEXITCODE -ne 0) { throw 'Test container did not start.' }
# Wait until pg_isready succeeds before running the suite.
docker exec toktickit-lab4-migration-test pg_isready -U lab4 -d postgres
$migrationPort = (docker port toktickit-lab4-migration-test 5432/tcp).Split(':')[-1]
$env:LAB4_MIGRATION_DATABASE_URL = "postgresql://lab4:lab4-test-only@127.0.0.1:$migrationPort/postgres"
$env:LAB4_POSTGRES_CONTAINER = 'toktickit-lab4-migration-test'
npx prisma generate
npm run test:migration
docker stop toktickit-lab4-migration-test
~~~

Without Docker, omit `LAB4_POSTGRES_CONTAINER` and provide matching `psql`, `pg_dump`, `pg_restore` on PATH (or `PSQL_PATH`, `PG_DUMP_PATH`, `PG_RESTORE_PATH`). `npm run test:migration` fails immediately if the explicit URL is missing. Ordinary `npm test` skips this isolated suite unless that URL is supplied. The dedicated [CI workflow](../../.github/workflows/lab4-migration.yml) supplies a fresh PostgreSQL 16 service and saves a JUnit report; remote CI execution is recorded only after it actually runs.

## Execution evidence

Local execution on 2026-10-20, branch `feature/lab4-3-db-migration`, base `a3b3df2` plus uncommitted working changes. Node 22.17.1, Prisma 5.22.0, Vitest 2.1.9, Windows PowerShell and a separate Docker PostgreSQL 16.15 server. The final migration run passed 9/9 tests in 23.47 seconds; the existing backend suite passed 113/113 tests against a separate migrated database. Schema validation, client generation, TypeScript build and migration/schema diff passed. See [tests.md execution ledger](tests.md#11-results-and-evidence-recording).

The final local run used this direct equivalent of `test:migration` to retain a JUnit report (with the disposable environment variables set as above):

~~~powershell
node node_modules/vitest/vitest.mjs run --config vitest.migration.config.ts --reporter default --reporter junit --outputFile ../test-results/lab4-migration.xml
~~~

- MIG-01: full historical migration chain into Lab 3, eight legacy Ticket states/priority aliases, seven-table row comparison, null/default backfill, no fabricated history, repeat deploy.
- DB-01..04: current Prisma model reads/writes, independent performers, historical inactive accounts, field constraints, FK restrictions, uniqueness, conditional versions, transaction rollback and required indexes.
- MIG-02 preflight portion: three unknown-field cases reject the deployment without data/schema changes; correct the source, reconcile the failed ledger and successfully retry.
- MIG-03: injected failure just before COMMIT leaves the original schema/data intact; custom-format pg_dump/pg_restore restores the exact Lab 3 rows and sequences; a separately restored post-upgrade dump retains all new rows; synthetic attachment hash matches its backup after restoration.

The broader MIG-02 resolution-gate behavior remains planned for workflow implementation. Issue #44 implements MIG-04 with the [seed and metric fixtures](seed-fixtures.md); `test:migration` now discovers both migration and seed suites. The 9-test result above records the original issue #43 run, and subsequent executions are recorded in tests.md. Schema/seed verification does not mark all of AC-16 complete or establish final-main release evidence.

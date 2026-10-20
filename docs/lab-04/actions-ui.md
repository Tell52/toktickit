# Actions Taken UI implementation

Issue: [#46](https://github.com/Tell52/toktickit/issues/46). Branch: `feature/lab4-6-actions-ui`, created after switching to `lab4-staging` and pulling merge commit `72533a4`.

## Implemented behavior

`ActionsTaken` is a shared section on Staff and Requester Ticket Detail. Desktop uses a wrapped eight-column table; below 1024px the same ordered records become labelled cards, with labels stacked above values at <=400px for readable long content. Bounded Previous/Next controls expose every page, including cancelled and previous-cycle work. View shows the full description/result, effective action time and immutable recorded time separately, performer, current/historical assignee, status, follow-up, plain-text Attachment Notes, cancellation reason, cycle and update time. Dates are labelled Asia/Bangkok; form dates are converted from UTC+07:00 to an offset-bearing UTC timestamp.

Staff and Administrators can create Planned work, edit permitted content/assignment, Start, Complete with a result, and Cancel with a reason. Assignment is independent of Ticket Owner and the immutable performer. Completed work fixes status and assignee while allowing content/follow-up corrections; cancelled work, earlier cycles and terminal Ticket states are read-only. Inactive historical assignees remain visible and unfinished work requires reassignment before completion. Staff can expand paginated, immutable revision snapshots. No Delete control is provided.

The owning Requester receives the shared read-only section. It never requests staff lookup or revisions and renders no mutation/history/Internal Note controls. Attachment Notes remain plain text; removed-file download behavior remains with the existing attachment section. Server authorization and validation remain authoritative.

The UI uses the four existing Actions endpoints through `client/src/actions-api.ts`, cookie authentication, the existing CSRF token, both expected versions for edits, and UUID idempotency keys for creates. No backend or migration changes are introduced by this issue.

## Drafts and recovery

- Required/length/date/assignment/result/follow-up validation preserves values, associates field messages and focuses the first invalid field. Character limits count Unicode code points. Turning off follow-up submits a null note; earlier snapshots remain available to staff.
- Busy controls and an immediate submission lock prevent double submissions. Success refetches Actions and Ticket details. Background public-comment/owner/priority refreshes keep an open action form mounted.
- Stale/retryable conflicts retain the draft. Load latest refetches Ticket state and Actions versions and shows saved values beside the retained draft; retry requires another explicit Save. An action or parent becoming read-only prevents a retained draft from being submitted.
- An uncertain create retains the original payload and key, locks its fields and pauses in-app navigation until an identical replay establishes the outcome. Known validation rejection allows correction with a new attempt/key. Failed PATCH operations require loading latest before retry.
- Authentication/authorization/not-found failures clear action/revision/draft content. A 401 invalidates the local session and the shell returns to Login. Password-change responses refresh authentication while retaining the CSRF token needed for that flow. Errors never display raw server/SQL/stack payloads.
- Drafts exist only in component memory. Dirty forms require native discard confirmation on Cancel, Escape or shell navigation; browser unload uses the native unsaved-change prompt. Native confirmations provide their own focus handling. Inline forms focus the first input and restore the initiating control on discard. No custom modal or localStorage draft is introduced.

The shell now wraps its identity/navigation controls on narrow screens, the logo is a keyboard-accessible link, and long Ticket numbers/requester emails wrap in staff detail. Ticket-detail content uses a wider desktop container to keep the eight-column list readable.

## Reproduce verification

Component tests need no database:

```powershell
Push-Location client
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=junit --outputFile=../test-results/lab4-client-regression.xml
npm run build
Pop-Location
```

The dedicated browser configuration requires an explicitly supplied disposable, migrated database with normal seed categories/systems. It starts its own backend on port 3106 and frontend on localhost:5173 and refuses to reuse existing servers. Keep those ports free. It does not fall back to the working DATABASE_URL. Example using a separate PostgreSQL 16 container:

```powershell
docker run --rm -d --name toktickit-lab4-ui-check -e POSTGRES_USER=lab4 -e POSTGRES_PASSWORD=lab4-test-only -e POSTGRES_DB=lab4_ui_test -p 127.0.0.1::5432 postgres:16
$lab4Port = (docker port toktickit-lab4-ui-check 5432/tcp).Split(':')[-1]
$env:LAB4_UI_DATABASE_URL = "postgresql://lab4:lab4-test-only@127.0.0.1:$lab4Port/lab4_ui_test"
$env:DATABASE_URL = $env:LAB4_UI_DATABASE_URL
Push-Location server
npx prisma migrate deploy
npm run prisma:seed
Pop-Location
npx playwright install
npx playwright test --config=playwright.actions.config.ts
docker stop toktickit-lab4-ui-check
```

Run this in a temporary shell so the test environment does not replace a later development session's variables. The test creates unique users/Tickets per case, checks real sessions/committed rows, and removes only those test aggregates in dependency order. The disposable container supplies all storage; the working database is untouched. The ordinary legacy browser configuration skips this opt-in file; the dedicated GitHub Actions workflow supplies the URL and executes every configured project.

## Evidence and boundaries

The final execution counts and failures/reruns are recorded in [tests.md](tests.md#11-results-and-evidence-recording). Component tests cover permissions, conditional fields, lifecycle payloads, immutable performer, historical assignees, safe text rendering, loading/empty/retry, stale draft review, identical replay, busy state, discard, session/password handling and parent integration. Real-browser cases cover three-action lifecycle/assignment/cancellation, inactive reassignment, Administrator revisions, Requester privacy/other-owner denial, committed-response loss with identical replay, competing edits, navigation guard, keyboard focus and responsive overflow checks on Chromium, Firefox and WebKit.

Screenshots use synthetic test data:

- [Desktop list, 1440x900](../../artifacts/lab-04/screenshots/actions-taken/staff-list-1440x900-chromium.png)
- [Tablet cards, 768x1024](../../artifacts/lab-04/screenshots/actions-taken/staff-list-768x1024-chromium.png)
- [Mobile cards, 390x844](../../artifacts/lab-04/screenshots/actions-taken/staff-list-390x844-chromium.png)
- [Narrow cards, 320x844](../../artifacts/lab-04/screenshots/actions-taken/staff-list-320x844-chromium.png)
- [Mobile validation/focus](../../artifacts/lab-04/screenshots/actions-taken/staff-validation-390x844-chromium.png)
- [Requester read-only, including cancelled/inactive history](../../artifacts/lab-04/screenshots/actions-taken/requester-read-only-390x844-chromium.png)

Automated reflow checks also use a 640px CSS viewport with doubled root text size. This supports zoom/reflow review; it does not claim native browser-menu 200% zoom or a complete screen-reader audit. Action buttons/summary controls use 44px targets, native checkbox labels provide a 44px row, focus is visible, status/follow-up use explicit text, and loading/success/errors use live/status/alert semantics. Calculated contrast ratios are 6.63:1 for green #006B3C on white, 10.85:1 for text #243B30 on #F0F4F1, 7.14:1 for error #A01919 on #F0F4F1, and 3.86:1 for input boundaries #718779 on white. Broader dashboard/workflow accessibility remains scheduled with those features.

Ticket resolution gates, Ticket status history/cascade/reopening and dashboard changes remain with later issues. Issue #46 does not mark their combined traceability rows passed or claim final-main release verification. The maintainer will commit/push and link the reviewed PR; no commit, push or merge is performed as part of this implementation.

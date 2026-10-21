# Ticket workflow UI and conflict recovery

Issue: [#48](https://github.com/Tell52/toktickit/issues/48). Branch: `feature/lab4-8-ticket-workflow-ui`, created from `lab4-staging` after `git pull --ff-only` at `da3b2ad`. The maintainer commits, pushes and merges into `lab4-staging`.

## Implemented behavior

Staff and Administrator Ticket Detail use `TicketWorkflow` for owner, IT priority and status. Status choices are restricted to the current state's transition matrix and the server's `allowedTransitions`. Resolve remains visible but disabled until the authoritative resolution gate is eligible. The section displays the current cycle, completed/unfinished/follow-up counts, each blocker in plain language and a link to Actions Taken. The resolution timestamp is labelled Asia/Bangkok. Requester indication is explicitly advisory.

Ordinary transitions, owner and priority save immediately with the observed Ticket version. Cancellation opens a named confirmation explaining which actions are affected and requires a trimmed reason of 1–1000 Unicode code points. Reopening requires confirmation explaining the new cycle, cleared resolution/advisory and the need for new completed work. The server remains authoritative for authorization, gate evaluation, atomic cancellation and cycle changes.

Success refreshes the Ticket summary, current status/version/gate, Actions list/selected record and paginated shared status history. Background refresh preserves an open Actions draft. Current-cycle cancellation and previous-cycle reopening make affected drafts read-only without discarding their text. Workflow controls wait for an in-flight Action write and its Ticket refresh, preventing a subsequent status change from using the pre-save version. Action creation also waits for the initial active-staff lookup; a failed lookup allows composition and explicit lookup retry while blocking an incomplete submission. Returning to My Queue or My Tickets remounts their existing server-backed lists and fetches current status.

`TicketStatusHistory` is shared with the owning Requester. It renders immutable from/to status, actor name, cycle, timestamp and cancellation reason, with bounded 20-event pages. It never requests or renders Internal Notes or staff-only Action revision history. Requester “Problem Appears Resolved” retains its eligible-status restrictions, confirmation and duplicate-submission lock; success refetches authoritative Ticket state without changing formal status.

## Failure and draft handling

- A synchronous submission lock and disabled controls prevent duplicate requests. Status/owner/priority choices and cancellation reasons remain in component memory after recoverable failures; no draft enters localStorage.
- Stale versions, invalid transitions, resolution-gate rejection, retryable transaction conflicts, network loss and server failures require **Load latest ticket**. It displays saved status/owner/priority/cycle beside retained input and updates the expected version. A second explicit confirmation or **Retry ticket change** performs the retry; no failure silently resubmits. An unavailable target or blocked gate keeps retry disabled and permits explicit discard.
- A confirmed successful write followed by a failed GET reports that the write succeeded. Loading latest retries only the read. An unknown write outcome is checked against saved state before allowing a reviewed retry; a status already applied is no longer a legal target.
- 401/403/password-change/404 feedback uses safe local text and clears the complete private detail, notes, action/revision data and drafts. The shell invalidates expired sessions or refreshes account state for role/password-change routing. Raw server payloads, SQL and stack traces are never displayed by the workflow.
- Dirty cancellation reasons and shell navigation require explicit discard confirmation. Browser unload uses the native unsaved-change prompt. Named confirmation dialogs contain Tab/Shift+Tab focus, ignore Escape while submitting, allow idle dismissal and restore the initiating control after it is re-enabled. Focus restoration ignores React Strict Mode's effect rehearsal.
- Requester advisory failures keep their confirmation available, require an authoritative refresh before retry, and hide an indication that became unavailable because another user changed the Ticket state.

## Verification and evidence

`client/tests/lab-04/TicketWorkflow.test.tsx` covers UI-05/UI-06, including all eight transition sources, staff/admin/Requester presentation, gate blockers, cancellation/reopening, stale/latest/explicit retry, safe denials, failed reads after successful writes, owner/priority recovery, duplicate submissions, dirty/focus behavior, Strict Mode and cross-component refresh ordering. `WorkflowApi.test.tsx` verifies HTTP status preservation, expected versions, reason, cookies/CSRF and uncached paginated history. Existing Actions and Labs 1–3 component cases remain in the regression command.

`e2e/lab-04/ticket-resolution.spec.ts` uses real sessions and PostgreSQL for four scenarios on Chromium, Firefox and WebKit: create/advisory/resolve/close/reopen/new-cycle resolution and return-to-list status; mixed-action cancellation and Requester privacy; two-session stale cancellation recovery; responsive/keyboard/dirty confirmation behavior. The dedicated configuration also executes the four existing Actions scenarios on every browser. CI is extended in `.github/workflows/lab4-actions-ui.yml`.

The layout is checked at 1440×900, 768×1024, 390×844 and 320×844, plus CSS text enlargement to 200%. Screenshots show the blocked gate and cancellation confirmation at each viewport:

- [Desktop](../../artifacts/lab-04/screenshots/ticket-workflow/cancellation-1440x900-chromium.png)
- [Tablet](../../artifacts/lab-04/screenshots/ticket-workflow/cancellation-768x1024-chromium.png)
- [Mobile](../../artifacts/lab-04/screenshots/ticket-workflow/cancellation-390x844-chromium.png)
- [Narrow mobile](../../artifacts/lab-04/screenshots/ticket-workflow/cancellation-320x844-chromium.png)

Controls are at least 44px high; forms and feedback wrap without page overflow. The primary green `#006b3c` on white has approximately 6.63:1 contrast. Screenshots are synthetic test data. Browser-menu zoom and a full assistive-technology audit remain separate manual checks; dashboard work and combined final-main release verification remain in their scheduled issues.

## Reproduce

Component tests and builds do not require a database:

```powershell
Push-Location client
node node_modules/vitest/vitest.mjs run --reporter=default --reporter=junit --outputFile=../test-results/lab4-client-regression.xml
npm run build
Pop-Location
npm run build --prefix server
```

For browser tests, use only an explicitly designated disposable database with normal seed categories/systems; the configuration refuses to use the working `DATABASE_URL` as a fallback. Keep backend port 3106 and frontend port 5173 available. The [Actions UI guide](actions-ui.md#reproduce-verification) includes isolated Docker provisioning. With that separate server running:

On Windows, use `127.0.0.1` when Docker publishes the database only on IPv4. In the PR #62 rehearsal, `localhost` delayed opening pooled connections and produced transaction-start timeouts: six concurrent read transactions failed 5/6 with `localhost` (4.06s total), while all six succeeded with `127.0.0.1` (34ms). Keep this local connection issue separate from the Linux CI layout/click failures.

```powershell
$env:LAB4_UI_DATABASE_URL = 'postgresql://lab4:lab4-test-only@127.0.0.1:<disposable-port>/lab4_ui_test'
$env:DATABASE_URL = $env:LAB4_UI_DATABASE_URL
Push-Location server
npx prisma migrate deploy
npm run prisma:seed
Pop-Location
node node_modules/@playwright/test/cli.js test --config=playwright.actions.config.ts
```

Initial local verification: **187 client tests passed** across 16 files; **24 browser cases passed** across all three browsers; client/server builds passed. Results and scope are recorded in [tests.md](tests.md#11-results-and-evidence-recording). Local logs/JUnit and failure traces remain under ignored `test-results/`; CI uploads them. The maintainer performs commits, pushes and merges.

### PR #62 CI correction

[CI run 39495660746](https://github.com/Tell52/toktickit/actions/runs/39495660746) at `8e661d0` passed 20/24 browser cases. All three browsers exposed an oversized Attachments tab at 320px and 200% text on Linux. WebKit also missed the Add action interaction while the page was scrolling; its trace shows the scroll position changing between the click action and completion.

Staff detail tabs now constrain their width and wrap long labels. Staff detail uses immediate scrolling so focus/anchor navigation settles before the next interaction. Clearing Actions form state only restores focus when a form was actually open; viewing a record no longer focuses a stale form trigger or the section container. The browser regression now positively verifies that previous-cycle details opened, and uses a wide monospace tab font for the 200% text check across platforms. A new component regression reproduces the focus bug before the fix.

The Node.js action-runtime deprecation warning was not the failing step. Remote verification of these corrections requires the maintainer to push to the existing PR branch.

Final correction verification: **188 client tests passed**, **24 browser cases passed** across Chromium/Firefox/WebKit, and the client production build passed. Reports: `test-results/pr62-client.xml` and `test-results/pr62-browser-final.xml`.

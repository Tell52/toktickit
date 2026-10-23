# Lab 4 Issue 12 — Zen Green UI and accessibility review

Issue [#52](https://github.com/Tell52/toktickit/issues/52). Branch `feature/lab4-12-ui-accessibility`, based on `20d2ceb` after pulling `lab4-staging`. The maintainer performs commit, push, PR review and merge.

## Changes and review scope

- The shared shell has named navigation/main landmarks, a keyboard skip link, route-specific document titles and focus movement after changing screens. Query-only filter changes retain input focus. Current-page/section links use an underline, dark panel and `aria-current`; all earlier role-permitted links remain. Modified link clicks retain native browser behavior. Failed sign-out has safe, retryable feedback.
- Both dashboards use four/two/one metric columns at desktop/tablet/mobile widths. The header and long Ticket/action text wrap. Shared fields, buttons, focus outlines and badges use the Zen Green palette. Status/priority have text labels; confidential staff Notes retain their lock icon and explicit visibility banner. Read-only fields remain visually distinct from editable controls.
- Requester/shared Ticket badges now use the same components as the staff queue. Darkened blue/orange/neutral text and outline-button colors correct measured contrast failures. Earlier My Tickets badges no longer make every status green.
- Staff conversation tabs have named tab/panel relationships, selected state, one tab stop, arrow-key cycling and Home/End navigation. Hidden panels keep stable targets while only selected content mounts.
- Workflow confirmations use native modal dialogs. The browser makes outside content inert to keyboard/pointer interaction; focus remains contained, Escape dismisses an idle confirmation through the existing dirty-draft guard, and closing returns focus to the initiating control. Responsive bounds allow scrolling the dialog at large text sizes.
- Visible labels now identify login/password/profile fields, read-only Requester detail and attachment input. Required-field guidance and associated creation errors support screen readers. Password recovery gives a working Administrator-contact instruction. The earlier Create Ticket upload control only logged a filename; it is replaced by guidance to use the existing Ticket Details attachment workflow.
- The current backend stores attachment metadata under `/uploads/` without serving the file bytes. Those references now keep the filename/details and explain that download is unavailable; they do not lead to a missing page. Supplied usable HTTP(S) file references retain their new-tab links, while unsafe URL schemes are rejected. This UI review does not add file storage/recovery. Long Requester summaries wrap in a read-only field, and the Public Comments visibility badge wraps below its heading on narrow screens.

## Visual and accessibility checklist

| Review item | Evidence / finding |
|---|---|
| Role navigation and current-page/section indication | Requester has My Tickets; staff/admin have My Queue; Admin is Administrator-only; Dashboard/Create/Profile remain. Named landmarks, skip link and route focus are covered by component/browser tests. |
| Desktop / tablet / mobile / narrow layouts | Four/two/one metric columns at 1440/768/390/320px; stacked previews/cards/forms; no page overflow in tested states. Screenshots show all three roles. |
| Large text, long content, no overlap | 320px Dashboard at 200% text; long Ticket/action text; wrapped read-only Summary and public-visibility heading. Preview counts remain separated from labels. |
| Keyboard / focus / dialog | Tab/Shift+Tab, Enter, arrow keys, Home/End and Escape; native modal top layer, focus containment and return. Explicit zero tab stops keep shell links reachable in tested WebKit settings. |
| Labels / required fields / errors | Visible label associations, required-field legend, creation error description/focus, safe sign-out recovery, password reset guidance. Existing action/workflow draft/retry tests remain part of regression. |
| Color-independent meaning / privacy | Text status/priority/role badges; confidential lock/banner and shared visibility labels; Requester DOM excludes private Notes. |
| Contrast / targets | WCAG-tagged axe scans plus sampled palette calculation below; browser target-size checks cover visible links/buttons/selects on dashboards/detail and earlier destinations. |
| Links / obsolete controls / errors | Native modified-click navigation; known placeholder upload/download controls removed or explicitly unavailable; authenticated flows assert no console/page errors. |

Sampled sRGB contrast ratios: primary `#006B3C` on white **6.63:1** and page `#F5F7F6` **6.16:1**; staff blue `#0755A5` on `#EBF5FF` **6.68:1**; In Progress orange `#9A3412` on `#FFF3BF` **6.55:1**; Medium priority `#844500` on `#FFF3BF` **6.65:1**; neutral `#495057` on `#F8F9FA` **7.76:1**. Input/metric boundaries `#718779` on white measure **3.86:1**. Focus is dark green on light surfaces and white in the green header. Decorative card separators are not used as the sole control or state cue.

## Verification approach

`e2e/lab-04/ui-accessibility.spec.ts` uses synthetic Requester, IT Staff and Administrator accounts in the explicitly selected disposable database. It checks live Dashboard/detail/create/profile/My Tickets/queue/admin routes, tab keys, skip-link/focus, dialog containment/return, target sizes and page overflow. Screenshots cover 1440×900, 768×1024, 390×844 and 320×844; Dashboard text-resize evidence uses 320px and 200% text. Requester DOM is checked for absent Internal Notes.

The suite uses [Playwright's axe integration](https://playwright.dev/docs/accessibility-testing) for WCAG 2 A/AA and 2.1 A/AA rules, without excluding nodes or disabling rules within those tags. Each scan saves its passing rules, violations and incomplete results as JSON attachments. Authenticated flows check uncaught page errors and console errors. The unauthenticated session probe before login is outside that authenticated console window.

Automated scans cover detectable problems in the tested states. Keyboard/viewport/screenshot inspection supplements them; this review does not claim a complete screen-reader certification or every WCAG criterion. `incomplete` results require interpretation and are retained for review.

## Reproduce

Migrate/seed a disposable UI database before running; do not seed a working database for review.

```powershell
$env:LAB4_UI_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/DISPOSABLE_UI_DB'
$env:DATABASE_URL = $env:LAB4_UI_DATABASE_URL
npx playwright test --config=playwright.accessibility.config.ts
# Full Labs 2–4 regression, including the accessibility file:
npx playwright test --config=playwright.hardening.config.ts
Push-Location client
node node_modules/vitest/vitest.mjs run --reporter=default --reporter=junit --outputFile=../test-results/lab4-ui-accessibility-client.xml
Pop-Location
```

The dedicated Actions UI workflow also runs this review and uploads reports/screenshots. CI and a reviewed implementation PR remain pending the maintainer's commit/push/review.

## Executed results — 2026-10-23

Windows, Node 22, isolated PostgreSQL 16.15; no working database was seeded. Results apply to the feature working tree.

| Evidence ID | Scope | Actual result | Local evidence |
|---|---|---|---|
| UIA-CLIENT-01 | All 21 client test files, including shell/labels/safe attachment references and existing Actions/workflow behavior | 228 passed, no failed/skipped cases. After the final attachment wrapping/label adjustment, all 9 Requester detail cases passed again. Existing legacy navigation tests emit React `act` warnings. | `test-results/lab4-ui-accessibility-client.xml` |
| UIA-REG-01 | Full Labs 2–4 browser regression, 28 scenarios per browser | 83 passed; one WebKit two-session/two-cycle workflow exceeded its 60s budget. This is retained as a failed broad run, not reported as 84 passes. | `test-results/lab4-ui-accessibility-all-browser.xml`; failing trace under `test-results/lab4-security-all-browser/` |
| UIA-BROWSER-01 | Final accessibility + Ticket workflow across Chromium, Firefox and WebKit, no retries | 27 passed, no failed/skipped cases: 15 accessibility scenarios and 12 existing workflow scenarios. The long workflow now has a scoped 120s budget; assertions remain unchanged. | `test-results/lab4-ui-accessibility-final-browser.xml` |
| UIA-AXE-01 | Dashboard desktop/narrow, shared Ticket/action list/detail, staff action form/private Notes, earlier destinations, confirmation and sign-in | 84 scans (28/browser), zero detected violations in the selected WCAG tags. Attachment copies are excluded from the count. | JSON scans/attachments under `test-results/lab4-ui-accessibility-final-browser/`; `test-results/lab4-ui-accessibility-summary.json` |
| UIA-VIS-01 | Final Chromium screenshot pass after the attachment Remove button wrapping correction | 5 passed; 22 screenshots retained. Visual inspection covered desktop/tablet/narrow dashboards, enlarged text, Requester detail wrapping and modal viewport bounds. | `test-results/lab4-ui-accessibility-browser.xml`; screenshot links below |
| UIA-BUILD-01 | Client TypeScript + production build; whitespace check | Passed | `npm run build --prefix client`; `git diff --check` |

The broad-run trace reaches the final Requester reload at the overall timeout; fixture cleanup then removes the synthetic accounts, explaining the subsequent `/auth/me` 401. The final 27-case run verifies that lifecycle with the longer budget on all three browsers. The earlier Issue #51 report is preserved separately; its 69-case result is not replaced by this 84-case run.

The final axe reports retain **54 `color-contrast` incomplete rule occurrences across the 84 scans**, including native select SVG backgrounds, dialog/viewport overlap detection, and a non-text checkmark. Named groups/regions corrected the earlier ARIA incomplete findings. Palette calculation and screenshot inspection supplement the scans; incomplete findings are not counted as automated passes or a complete manual contrast audit. No NVDA/VoiceOver session or native browser-menu zoom certification was performed; 200% text resizing was tested.

## Screenshot evidence

All images use synthetic accounts/Tickets. The 22 `accessibility-*.png` images comprise five Requester dashboard images, ten staff/admin dashboard images, three shared Ticket/Actions images and four modal viewport images. Older feature screenshots are retained unchanged.

- [Requester desktop](../../artifacts/lab-04/screenshots/requester-dashboard/accessibility-0-1440x900.png), [tablet](../../artifacts/lab-04/screenshots/requester-dashboard/accessibility-0-768x1024.png), [320px mobile](../../artifacts/lab-04/screenshots/requester-dashboard/accessibility-0-320x844.png), [200% text](../../artifacts/lab-04/screenshots/requester-dashboard/accessibility-0-320-text-200.png).
- [IT Staff desktop](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-1-1440x900.png), [tablet](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-1-768x1024.png), [320px mobile](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-1-320x844.png).
- [Administrator desktop](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-2-1440x900.png), [320px mobile](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-2-320x844.png), [200% text](../../artifacts/lab-04/screenshots/staff-dashboard/accessibility-2-320-text-200.png).
- Shared Actions/detail at 320px: [Requester](../../artifacts/lab-04/screenshots/actions-taken/accessibility-0-shared-320.png), [IT Staff](../../artifacts/lab-04/screenshots/actions-taken/accessibility-1-shared-320.png), [Administrator](../../artifacts/lab-04/screenshots/actions-taken/accessibility-2-shared-320.png).
- Native confirmation: [desktop](../../artifacts/lab-04/screenshots/actions-taken/accessibility-confirmation-1440x900.png), [tablet](../../artifacts/lab-04/screenshots/actions-taken/accessibility-confirmation-768x1024.png), [390px](../../artifacts/lab-04/screenshots/actions-taken/accessibility-confirmation-390x844.png), [320px](../../artifacts/lab-04/screenshots/actions-taken/accessibility-confirmation-320x844.png).

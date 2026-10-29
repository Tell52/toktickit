from pathlib import Path
from xml.sax.saxutils import escape
import json, re, subprocess
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader
from PIL import Image

ROOT=Path(r'E:\cpe334\toktickit')
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
DEST=OUT/'67070503411_TokTickIT_Lab4.pdf'
W,H=595.276,841.89; M=42; CW=W-2*M
GREEN=colors.HexColor('#006B3C'); INK=colors.HexColor('#20382D'); MUTED=colors.HexColor('#586B61')
c=canvas.Canvas(str(DEST),pagesize=(W,H))
c.setTitle('CPE 334 Lab 4 - TokTickIT - Napat Tantipibulsap 67070503411')
c.setAuthor('Napat Tantipibulsap')
BASE='https://github.com/Tell52/toktickit'
SHA='aa2e7845d3e4ad49c85a3267eafb28540d98e528'
page=0; y=0; fields=[]
sty=ParagraphStyle('body',fontName='Helvetica',fontSize=10,leading=14,textColor=INK,spaceAfter=7)
small=ParagraphStyle('small',parent=sty,fontSize=8,leading=11)
def para(s,size=10):
    global y
    st=ParagraphStyle('p',parent=sty,fontSize=size,leading=size*1.4)
    p=Paragraph(s,st); _,h=p.wrap(CW,800)
    assert y-h>43,(page,y,h,s[:60])
    p.drawOn(c,M,y-h); y-=h+7
def title(s):
    global y
    para('<b>'+s+'</b>',12)
def link(path,label=None):
    url=path if path.startswith('https:') else BASE+'/blob/'+SHA+'/'+path
    return '<link href="'+url+'" color="#006B3C"><u>'+escape(label or path)+'</u></link>'
def source(path,label=None): para('Evidence: '+link(path,label),8)
def start(part,subtitle,cont=False):
    global page,y
    if page:c.showPage()
    page+=1
    c.setFillColor(GREEN); c.rect(0,H-12,W,12,fill=1,stroke=0)
    c.setFont('Helvetica-Bold',9);c.drawString(M,H-36,'TOKTICKIT  /  CPE 334  /  LAB 4')
    c.setFillColor(MUTED);c.setFont('Helvetica',8)
    c.drawRightString(W-M,H-36,'29 October 2026')
    c.setFillColor(GREEN);c.setFont('Helvetica-Bold',22)
    c.drawString(M,H-74,f'Answer Part {part}'+(' (continued)' if cont else ''))
    c.setFillColor(INK);c.setFont('Helvetica-Bold',13);c.drawString(M,H-97,subtitle)
    c.setStrokeColor(colors.HexColor('#C9DCD0'));c.line(M,39,W-M,39)
    c.setFillColor(MUTED);c.setFont('Helvetica',8)
    c.drawString(M,26,'Napat Tantipibulsap  |  67070503411')
    c.drawRightString(W-M,26,str(page));y=H-119
def table(rows,widths=None,size=9):
    global y
    widths=widths or [CW/len(rows[0])]*len(rows[0])
    st=ParagraphStyle('cell',parent=sty,fontSize=size,leading=size*1.35)
    data=[[Paragraph(str(v),st) for v in row] for row in rows]
    t=Table(data,colWidths=widths)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E3EFE8')),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#CCDAD1'))]))
    _,h=t.wrap(CW,800);assert y-h>43,(page,y,h)
    t.drawOn(c,M,y-h);y-=h+10
def field(name,label,height=36):
    global y
    para('<b>'+label+'</b>',9)
    assert y-height>43,(page,name,y)
    c.acroForm.textfield(name=name,tooltip=label,x=M,y=y-height,width=CW,height=height,fontName='Helvetica',fontSize=10,borderWidth=.6,borderColor=colors.HexColor('#7A9987'),fillColor=colors.HexColor('#F6FAF7'),textColor=INK,forceBorder=True,fieldFlags='multiline',maxlen=3000)
    fields.append(name);y-=height+12
def picture(path,maxheight=300,crop=None):
    global y
    im=Image.open(ROOT/path)
    if crop: im=im.crop(crop)
    w,h=im.size;scale=min(CW/w,maxheight/h)
    assert y-h*scale>43,(page,y,h*scale)
    c.drawImage(ImageReader(im),M+(CW-w*scale)/2,y-h*scale,width=w*scale,height=h*scale)
    y-=h*scale+8
def pair(paths,labels):
    global y
    top=y; width=(CW-16)/2
    for idx,path in enumerate(paths):
        im=Image.open(ROOT/path);im=im.crop((0,0,im.width,min(im.height,1024 if idx==0 else 844)))
        sw,sh=im.size;scale=min(width/sw,420/sh)
        x=M+idx*(width+16)+(width-sw*scale)/2
        c.drawImage(ImageReader(im),x,top-sh*scale,width=sw*scale,height=sh*scale)
        c.setFont('Helvetica',9);c.setFillColor(MUTED);c.drawString(M+idx*(width+16),top-435,labels[idx])
    y=top-455

start(1,'Git use with engineering workflow')
para('<b>Napat Tantipibulsap</b> &nbsp; | &nbsp; Student ID: <b>67070503411</b><br/>Introduction to Software Engineering in the Age of AI Agents - Semester 1/2026')
para(link(BASE,'Repository')+' &nbsp; | &nbsp; '+link(BASE+'/commits/lab4-staging','Staging history')+' &nbsp; | &nbsp; '+link(BASE+'/commits/main','Main history'))
para('Evidence snapshot: local feature commit <b>aa2e784</b>. GitHub PR #67 was merged into <b>lab4-staging</b> on 24 October 2026 as <b>5513e16</b>. Remote <b>main remains 04ceb7c</b> (Lab 3); final Lab 4 integration and tests on main are still required.',9)
table([['Work package','Feature PR / integration evidence'],['Specification and test plan',link(BASE+'/pull/55','PR #55')+' / '+link(BASE+'/pull/56','PR #56')+'; merges 63d3004 / a3b3df2'],['Migration, seed, Actions API/UI','PR #57-60; a1dd4df, 52ce172, 72533a4, b8f2bec'],['Ticket workflow API/UI','PR #61-62; da3b2ad, fc9078d'],['Requester / staff dashboards','PR #63-64; f0d6932, d7cf6df'],['Security / accessibility','PR #65-66; 20d2ceb, fc56ed8'],['E2E and regression',link(BASE+'/pull/67','PR #67')+'; 5513e16 (remote staging)']],[185,CW-185])
title('Repository and setup evidence')
para('The '+link('README.md','README')+' documents setup, environment configuration, migration, seed accounts and regression commands. '+link('.gitignore','.gitignore')+' excludes dependencies, .env files, build output and temporary Playwright reports. Reviewable evidence is retained under artifacts/lab-04/.',9)
table([['Directory','Contents'],['docs/lab-04/','specification.md, tests.md, ui-spec.md, api-spec.md; implementation and execution guides'],['server/','Prisma schema/migrations/fixtures; routes and Lab 1-4 API/unit tests'],['client/ and e2e/','React UI/component tests; browser regression across Labs 2-4'],['artifacts/lab-04/','Screenshots; server/client/browser JUnit reports; execution and performance summaries']],[145,CW-145],8)
para('<b>Pending submission evidence:</b> final staging-to-main merge; final-main test output; Kanban with all sprint Issues Done; rendered Lab 4 reviewer record and AI-use record. These are not asserted complete.',9)

start(1,'Peer review and final integration record',True)
para('Reserved for the student to complete with actual review evidence. No Lab 4 reviewer.md exists in the inspected checkout. A merge by a collaborator alone is not treated as a documented review approval.',10)
field('section','Course section',25)
field('reviewer','Reviewer name, student ID and GitHub handle',35)
field('review_links','Reviewed PR links and approval dates',65)
field('review_comments','Key review comments and my responses / resulting changes',115)
field('project','GitHub Project / Kanban link and final Done evidence',55)
field('release','Final main commit, release PR and passing test-run links',55)
para('Add the completed review record to docs/lab-04/reviewer.md and include its rendered evidence before final submission.',9)

start(2,'Spec DD: engineering contract')
source('docs/lab-04/specification.md','Rendered specification and full numbered contract')
para('The contract was committed on <b>20 October 2026</b> (34d4368 / abf9a60) and integrated by PR #55 before the subsequent migration/API/UI PRs. Local ancestry records specification merge 63d3004 before implementation merges #57-67.',9)
title('Rendered contract excerpts and decisions')
table([['Requirement / rule','Contract'],['FR-01 / FR-04','Staff/Admin create and update Actions Taken; owning Requesters read current actions only.'],['FR-05 / BR-10','Every accepted action change appends an immutable full revision with actor and time.'],['BR-02 / BR-03 / BR-04','Ticket Owner, automatic recording performer and active staff/admin assignee are separate responsibilities.'],['BR-06 / BR-07','Follow-up requires a nonblank note; effective action time includes an offset and falls between Ticket creation and now.'],['BR-13','Resolve only with at least one Completed current-cycle action, no unfinished current-cycle actions and no non-cancelled follow-up blockers.'],['BR-17 / BR-18 / BR-19','Expected versions reject stale writes with 409; creation uses idempotency keys; writes serialize on the parent Ticket in a transaction.'],['BR-20 / BR-21','Backend aggregates are authoritative. Recent metrics use a Bangkok calendar window [since, asOf).']],[128,CW-128],9)
title('Data and migration rationale')
para('<b>Decision 1:</b> preserve numeric Ticket IDs and UUID User references; introduce ActionTaken, immutable revisions and Ticket status events. Foreign keys and constrained lifecycle fields preserve consistency.<br/><b>Decision 2:</b> additive migration sets legacy cycle/version to 1 without inventing actions or resolution times. Unknown legacy resolvedAt stays null and is excluded only from time-based resolution metrics.<br/><b>Decision 3:</b> retain idempotent fixtures with stable identities and preserve edited accounts/Tickets on repeat seed; recovery tests use isolated databases.',9)
title('Acceptance criteria and Product Definition of Done')
para('AC-01-12 cover action fields, roles, lifecycle, audit, gate and conflicts; AC-13-15 cover metrics and drill-down; AC-16-22 cover migration, security, recovery UI, regression and performance; AC-23-24 cover release evidence and complete journeys. Done requires passing tests, preserved data, reviewed UI/accessibility, updated setup instructions, actual review/AI records and integration through staging to main. <b>Release evidence remains pending.</b>',9)
source('docs/lab-04/api-spec.md','API methods, payloads, authorization and safe errors')

start(3,'Test DD and acceptance-criteria traceability')
source('docs/lab-04/tests.md','Rendered test plan, AC mapping and execution ledger')
para('Saved execution evidence (23 October 2026): Windows 11, Node 22.17.1, PostgreSQL 16.15; separate disposable API/UI databases. The original ledger explicitly identifies a feature working tree, not final-main certification. No new full test run is claimed by this report.',9)
summary=json.loads((ROOT/'artifacts/lab-04/regression/execution-summary.json').read_text())
rows=[['Saved JUnit report','Tests','Failed / error / skipped']]
for key in ['server','client','browser']:
    r=summary['reports'][key];rows.append([link('artifacts/lab-04/regression/'+key+'.xml',key+'.xml'),str(r['tests']),f"{r['failures']} / {r['errors']} / {90 if key=='browser' else r['skipped']}"])
table(rows,[255,65,CW-320])
para('<b>Verified saved reports: 652 passes</b> (424 backend + 228 client). The summary claims 90 browser passes, but the committed browser.xml contains <b>90 skipped cases</b> and its SHA-256 differs from the summary. Browser success requires the matching original report or a fresh run; it is not certified here.',9)
table([['ACs / planned tests','Actual paths (relative to repository) / saved result'],['AC-01-06,12 / API-01-11','server/tests/lab-04/actions-taken.api.test.ts: 70 passed; action-validation.test.ts: 54 passed'],['AC-07-10 / WF-01-06','server/tests/lab-04/ticket-workflow.api.test.ts: 68 passed'],['AC-11,17 / CON, SEC','server/tests/lab-04/concurrency.api.test.ts: 5 passed; authorization.api.test.ts: 40 passed'],['AC-13-15 / DASH, E2E','server/tests/lab-04/requester-dashboard.api.test.ts: 19; staff-dashboard.api.test.ts: 15; dashboard-calculations.test.ts: 19 passed'],['AC-16 / MIG, SEED','server/tests/lab-04/migration-regression.test.ts: 9; seed-fixtures.test.ts: 11 passed'],['AC-18-20 / UI, VIS, A11Y','client/tests/lab-04/ActionsTaken.test.tsx: 38; TicketWorkflow.test.tsx: 41; RequesterDashboard.test.tsx: 12; StaffDashboard.test.tsx: 10 passed'],['AC-21,24 / REG, E2E','e2e/lab-02/, e2e/lab-03/, e2e/lab-04/: 90 skipped in saved browser.xml; summary/report mismatch unresolved'],['AC-22 / PERF; AC-23 / REL','dashboard-performance.test.ts: 1 passed; final-main release verification remains pending']],[135,CW-135],8)
para('This table condenses the plan. '+link('artifacts/lab-04/regression/execution-summary.json','execution-summary.json')+' preserves reported counts/hashes, but must be reconciled with the browser XML. Server/client report hashes match; browser evidence and final-main verification remain open.',8)

start(4,'AI use with reflection')
para('Student-completion section, as requested. Enter the actual model and 6-10 prompts used for Lab 4. The Lab 3 AI-use record is not reused as Lab 4 evidence.',10)
field('llm','LLM / agent name and version actually used',28)
for i in range(1,7):field('prompt'+str(i),f'Key prompt {i} - actual prompt or faithful summary; how the result was used',52)

start(4,'My Reflection',True)
field('prompt7','Optional key prompt 7',45)
field('prompt8','Optional key prompt 8',45)
field('reflection_spec','My Reflection - specification agent: decisions, ambiguities and useful guidance',100)
field('reflection_code','My Reflection - coding agent: implementation, testing and iteration',100)
field('reflection_correction','What I corrected or rejected, and what I learned',100)
para('After completing this section, save the authentic record in docs/lab-04/ai-use.md. The PDF fields are editable; review all entered text for clipping before submitting.',9)

start(5,'Working IT Staff dashboard UI')
picture('artifacts/lab-04/screenshots/staff-dashboard/dashboard-1440x900.png',320,(0,0,1440,900))
para('Recorded desktop screenshot, top viewport; synthetic browser dataset. Displayed counts (2 unassigned, 1 owned, 13 recent, 7 actions) are from that scenario and are not the separate fixed-clock oracle below.',8)
table([['Metric / fixed-clock S1 value','Predicate / destination'],['Unassigned = 2; My open = 2','ACTIVE + owner null / current user; filtered /queue'],['Recently updated = 8','updatedAt in [since, asOf); bounded preview plus full filtered queue'],['My active actions = 3','Current-cycle Planned/In Progress assigned to current user on ACTIVE Tickets; paginated My actions'],['Priority Low/Medium/High = 1/1/3','ACTIVE grouped by itPriority ?? requestedPriority']],[205,CW-205],9)
para('The fixed fixture uses 11 Tickets/8 actions at asOf 2026-10-20T10:00Z. Seed tests compare an independent SQL oracle with the known expected totals; dashboard API tests compare returned metrics. SQL converts bounds to UTC explicitly to avoid session-timezone dependence.',9)
para('Loading, zero data, forbidden and recoverable failures are covered by StaffDashboard.test.tsx. A failed load does not fabricate zero counts. Cards preserve filters; actions link to their parent Ticket; refresh and Back/Forward are covered by browser tests.',9)
source('docs/lab-04/staff-dashboard.md','Staff dashboard implementation and verification')
source('docs/lab-04/seed-fixtures.md','Independent fixture/SQL metric evidence')

start(6,'Working Actions Taken UI')
picture('artifacts/lab-04/screenshots/actions-taken/staff-list-1440x900-chromium.png',245)
para('Recorded staff action list. Multiple actions belong to one Ticket; owner, performer and assignee remain independent.',8)
table([['Operation','Rule and recorded verification'],['Create / assign / edit','Description, effective time, result, follow-up and attachment notes; automatic performer. Active staff/admin assignee required. API suite: 70 passed.'],['Start / complete / cancel','Planned to In Progress/Completed/Cancelled; In Progress to Completed/Cancelled. Completion needs result; cancellation needs reason. Cancelled is read-only.'],['Validation / inactive assignee','Blank fields, future/local-only dates and missing follow-up notes are rejected; inactive assignee cannot be newly assigned or complete unfinished work.'],['Role and ownership','Owning Requester sees shared current values without edit controls; all Requester writes denied. Staff-only revision history and Internal Notes remain private.'],['Safe failure / concurrency','409 retains draft for reload/review. Repeated create with same key/payload replays the original result; pending controls prevent duplicate clicks.'],['Multiple staff / responsive UI','E2E actions-taken-flow.spec.ts verifies distinct staff/admin performers on one Ticket without changing Ticket Owner. Mobile/tablet evidence appears in Part 9.']],[125,CW-125],9)
source('docs/lab-04/actions-ui.md','Actions list/create/edit, draft recovery and browser evidence')
source('docs/lab-04/actions-api.md','Action validation, authorization, revision and retry contracts')

start(7,'Working Ticket workflow')
table([['From','Permitted targets (Staff / Administrator only)'],['New','Open, In Progress, Cancelled'],['Open','In Progress, Waiting for Requester, Cancelled'],['In Progress','Waiting for Requester, Resolved, Cancelled'],['Waiting for Requester','In Progress, Resolved, Cancelled'],['Resolved / Closed','Resolved: Closed or Reopened; Closed: Reopened'],['Reopened / Cancelled','Reopened: In Progress, Waiting for Requester, Cancelled; Cancelled: none']],[145,CW-145],9)
para('<b>Resolution gate:</b> at least one Completed action in the current cycle, no unfinished actions, no non-cancelled follow-up blockers. The Requester advisory never changes formal status. Reopening starts a new cycle and clears resolution/advisory state.',9)
picture('artifacts/lab-04/screenshots/ticket-workflow/cancellation-1440x900-chromium.png',235)
para('Recorded cancellation screen. Cancellation requires a reason and atomically cancels unfinished actions. Completed evidence remains intact. Accepted transitions append immutable status events ordered by (createdAt ASC, id ASC); owning Requesters see status history, while action revisions remain staff-only.',9)
para('Saved tests: 68 workflow API cases and 41 TicketWorkflow component cases passed. Browser ticket-resolution.spec.ts covers resolve/close/reopen/new-cycle work and cancellation, including stale conflicts and dashboard/list agreement.',9)
source('docs/lab-04/ticket-workflow-ui.md','Workflow UI, stable history and conflict-recovery evidence')

start(8,'Requester dashboard and final regression UI')
picture('artifacts/lab-04/screenshots/requester-dashboard/dashboard-1440x900-chromium.png',305)
para('Recorded Requester desktop screen. Metrics and previews are scoped to the authenticated Requester; the screenshot uses its own synthetic browser fixture.',8)
table([['Requester R1 fixed-clock oracle','Expected result'],['Open / Waiting for you','4 / 1'],['Updated / Resolved in last 7 days','6 / 2; legacy null resolvedAt excluded from recent resolution'],['Attention / recent preview','T4 / T11, T4, T6, T5, T3 (maximum five)'],['Zero-data Requester R0','All counts 0; empty lists with useful next action']],[220,CW-220],9)
para('Every query first scopes requesterId to the session user. Non-owned and missing Tickets both return 404; private Notes are absent. Metric destinations preserve status/date filters and refresh/back behavior. Same-session R1/R2/Staff/Admin switching is covered by e2e/lab-04/dashboards.spec.ts.',9)
para('<b>Labs 1-3 regression:</b> authentication/password change, My Tickets, detail, Public Comments, Internal Notes, staff queue/operations and Administrator management are included in the saved suites. Attachment tests verify metadata, validation, ownership and soft removal. The baseline does not provide persistent uploaded bytes/download serving; this is a documented limitation, not a verified download feature.',9)
source('docs/lab-04/e2e-regression.md','Full regression scope, commands and limitations')

start(9,'Zen Green, accessibility and final polish')
source('docs/lab-04/ui-spec.md','Rendered UI contract; selected rules below')
para('Primary #006B3C; page #F5F7F6; white cards and muted read-only surfaces #F0F4F1. Shared 4/8/16/24/32px spacing and 12px card radius. Real navigation links identify the current page, with role-safe destinations and visible focus.',9)
table([['Visual / accessibility checklist','Recorded evidence / status'],['Design and responsive consistency','Four/two/one dashboard columns; desktop 1440, tablet 768, mobile 390 and narrow 320px. Screenshot evidence follows.'],['Labels and shared/private fields','Visible labels and required/error associations; automatic fields read-only; text badges communicate status/priority; private Notes use an explicit banner.'],['Keyboard and focus','Skip link, route focus, tab/panel arrow navigation; native dialog containment, Escape handling and focus return tested.'],['Clipping, overlap and overflow','Browser overflow checks and retained screenshot review; 320px with 200% text resizing. Native browser-menu zoom was not certified.'],['Feedback and drafts','Loading, empty, forbidden, not-found, validation and safe API failures; retry and conflict recovery preserve relevant drafts.'],['Automated accessibility','84 axe scans: zero detected violations; 54 color-contrast incomplete occurrences retained for review. Not a complete WCAG or screen-reader certification.'],['Contrast','Documented samples: green on white 6.63:1; green on page 6.16:1; orange status text 6.55:1.'],['Release polish remaining','Final-main verification, authentic reviewer/AI records, Kanban completion and deployment/file recovery evidence remain pending.']],[150,CW-150],9)
title('Performance-smoke evidence')
para('10,000 Tickets and 30,000 actions; 5 warm-ups then 20 sequential requests per role. Recorded p95: Requester 9.602ms, Staff 45.682ms, Administrator 47.351ms, below the 1,000ms lab target. Fixed query counts: 8 / 14 / 14; bounded preview sizes. These are local measurements, not a production SLA.',9)
source('artifacts/lab-04/regression/dashboard-performance.json','Raw environment, timings, query counts and response sizes')
source('docs/lab-04/ui-accessibility.md','Completed visual checklist and accessibility limitations')

for folder,stem,lab in [('staff-dashboard','dashboard-{size}.png','Staff dashboard'),('requester-dashboard','dashboard-{size}-chromium.png','Requester dashboard'),('actions-taken','staff-list-{size}-chromium.png','Actions Taken')]:
    start(9,lab+' - tablet and mobile evidence',True)
    p1=f'artifacts/lab-04/screenshots/{folder}/'+stem.format(size='768x1024')
    p2=f'artifacts/lab-04/screenshots/{folder}/'+stem.format(size='390x844')
    para('Recorded browser screenshots. Long captures are cropped to their initial viewport for readable comparison; the linked original files retain the full evidence.',9)
    pair([p1,p2],['Tablet - 768px capture','Mobile - 390px capture'])
    source(p1,'Original tablet screenshot');source(p2,'Original mobile screenshot')
    if folder=='actions-taken':
        para('Actions use a table/list or stacked cards according to available width. Requesters have read-only content; staff controls expose edit and lifecycle operations. Validation and confirmation evidence are retained separately.',9)
        source('artifacts/lab-04/screenshots/actions-taken/staff-validation-390x844-chromium.png','Mobile validation screenshot')
    else:
        para('Metric cards and preview sections reflow vertically. Counts remain labelled, Ticket links remain visible and detailed lists remain available through drill-down. Desktop evidence appears in the relevant earlier Answer Part.',9)
c.save()
(OUT/'submission_fields.json').write_text(json.dumps({'pdf':DEST.name,'fields':fields},indent=2))
print(str(DEST)); print('Pages:',page,'Editable fields:',len(fields))

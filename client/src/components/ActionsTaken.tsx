import { useEffect, useRef, useState } from 'react';
import { ActionTaken, ActionsError, ActionsResponse, ActionStatus, ActionWrite, Revision, createAction, getActions, getActionRevisions, updateAction } from '../actions-api';
import { getStaffUsers, StaffUserItem } from '../api';
import { useAuth } from '../context/AuthContext';
import './ActionsTaken.css';

type Mode = 'create' | 'edit' | 'complete' | 'cancel';
type Draft = { actionAt: string; description: string; result: string; assigneeId: string; followUpRequired: boolean; followUpNote: string; attachmentNotes: string; cancellationReason: string };
type Props = { ticketId: string | number; ticketStatus: string; ticketCreatedAt?: string; currentUser?: { id: string | number; name: string; role: string }; readOnly?: boolean; refreshTicket?: () => Promise<unknown> };
const labels: Record<ActionStatus, string> = { PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const bangkokInput = (value: string) => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 19);
const dateLabel = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) + ' (Asia/Bangkok)';
const size = (value: string) => [...value.trim()].length;
const blank = (value: string) => value.trim() || null;
function ActionValues({ action }: { action: ActionTaken }) {
  return <dl>
    <dt>Action time</dt><dd>{dateLabel(action.actionAt)}</dd><dt>Recorded at</dt><dd>{dateLabel(action.createdAt)}</dd>
    <dt>Description</dt><dd>{action.description}</dd><dt>Result</dt><dd>{action.result || 'No result recorded yet'}</dd>
    <dt>Performed by</dt><dd>{action.performedBy.name}</dd><dt>Assigned to</dt><dd>{action.assignee.name}{!action.assignee.isActive && ' (inactive)'}</dd>
    <dt>Status</dt><dd>{labels[action.status]}</dd><dt>Follow-up required</dt><dd>{action.followUpRequired ? 'Yes' : 'No'}</dd>
    {action.followUpRequired && <><dt>Follow-up note</dt><dd>{action.followUpNote}</dd></>}
    <dt>Attachment Notes</dt><dd>{action.attachmentNotes || 'None'}</dd>
    {action.cancellationReason && <><dt>Cancellation reason</dt><dd>{action.cancellationReason}</dd></>}
    <dt>Resolution cycle</dt><dd>{action.resolutionCycle}</dd><dt>Last updated</dt><dd>{dateLabel(action.updatedAt)}</dd>
  </dl>;
}

export default function ActionsTaken({ ticketId, ticketStatus, ticketCreatedAt, currentUser, readOnly = false, refreshTicket }: Props) {
  const auth = useAuth();
  const user = currentUser ?? auth.user;
  const staff = !readOnly && !!user && ['IT_STAFF', 'ADMINISTRATOR'].includes(user.role.toUpperCase());
  const parentActive = ['new', 'open', 'in progress', 'waiting for requester', 'reopened'].includes(ticketStatus.toLowerCase().replaceAll('_', ' '));
  const [data, setData] = useState<ActionsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [users, setUsers] = useState<StaffUserItem[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [selected, setSelected] = useState<ActionTaken | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialDraft, setInitialDraft] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [needsLatest, setNeedsLatest] = useState(false);
  const [latest, setLatest] = useState<ActionTaken | null>(null);
  const [uncertain, setUncertain] = useState<{ body: ActionWrite; key: string } | null>(null);
  const [history, setHistory] = useState<{ revisions: Revision[]; pagination: { page: number; pageSize: number; totalCount: number } } | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const dirty = !!draft && JSON.stringify(draft) !== initialDraft;
  useEffect(() => () => { alive.current = false; }, []);
  const editable = (action: ActionTaken) => staff && parentActive && action.resolutionCycle === data?.resolutionCycle && action.status !== 'CANCELLED';
  function closeForm() { setMode(null); setDraft(null); setUncertain(null); setFields({}); setNeedsLatest(false); setLatest(null); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else sectionRef.current?.focus(); }
  function canLeave() {
    if (inFlight.current || uncertain) return false;
    return !dirty || window.confirm('Discard unsaved action changes?');
  }
  useEffect(() => {
    const guard = (event: Event) => { if (!canLeave()) event.preventDefault(); else if (draft) closeForm(); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || uncertain || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('toktickit:before-navigate', guard);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('toktickit:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, [dirty, uncertain, busy]);
  function handleFailure(err: unknown): boolean {
    if (err instanceof ActionsError && [401, 403, 404].includes(err.status)) {
      setData(null); setSelected(null); setHistory(null); closeForm(); setDenied(true);
      setError(err.status === 401 ? 'Your session has ended. Please sign in again.' : err.code === 'PASSWORD_CHANGE_REQUIRED' ? 'Change your password before continuing.' : err.status === 404 ? 'Ticket could not be found.' : 'You do not have permission to access these actions.');
      if (err.status === 401) { localStorage.removeItem('csrfToken'); if (auth.invalidateSession) auth.invalidateSession(); else void auth.checkAuth(); }
      else if (err.status === 403) void auth.checkAuth();
      return true;
    }
    return false;
  }
  async function load(targetPage = page, retainDraft = false) {
    setLoading(true); setError('');
    try {
      if (retainDraft) { setNeedsLatest(true); await refreshTicket?.(); }
      const fresh = await getActions(ticketId, targetPage);
      if (!alive.current) return;
      setData(fresh); setDenied(false);
      if (retainDraft && selected) {
        let found = fresh.actions.find(a => a.id === selected.id);
        // An effective-time edit can move the selected action to another page.
        for (let p = 1; !found && p <= Math.ceil(fresh.pagination.totalCount / fresh.pagination.pageSize); p++) {
          if (p !== targetPage) found = (await getActions(ticketId, p)).actions.find(a => a.id === selected.id);
        }
        if (!alive.current) return;
        if (!found) { setNeedsLatest(true); setError('The action is no longer available. Keep a copy of your draft before leaving.'); return; }
        setSelected(found); setLatest(found);
        if (!parentActive || found.resolutionCycle !== fresh.resolutionCycle || found.status === 'CANCELLED' || (mode !== 'edit' && found.status === 'COMPLETED')) {
          setNeedsLatest(true); setError('This action is now read-only. Your draft is retained for reference.'); return;
        }
      }
      setNeedsLatest(false);
    } catch (err) { if (alive.current && !handleFailure(err)) setError('Actions could not be loaded. Please retry.'); }
    finally { if (alive.current) setLoading(false); }
  }
  async function loadUsers() {
    try { const result = await getStaffUsers(); if (alive.current) { setUsers(result.users); setUsersError(false); } }
    catch { if (alive.current) setUsersError(true); }
  }
  useEffect(() => { alive.current = true; void load(); if (staff) void loadUsers(); }, [ticketId, staff]);
  useEffect(() => { if (mode) formRef.current?.querySelector<HTMLElement>('input:not([readonly]),textarea')?.focus(); }, [mode]);
  const begin = (nextMode: Mode, action: ActionTaken | null = null, trigger = document.activeElement as HTMLElement) => {
    if (!canLeave()) return;
    returnFocus.current = trigger;
    const next: Draft = {
      actionAt: bangkokInput(action?.actionAt ?? new Date().toISOString()), description: action?.description ?? '', result: action?.result ?? '',
      assigneeId: action?.assignee.id ?? String(user?.id ?? ''), followUpRequired: action?.followUpRequired ?? false,
      followUpNote: action?.followUpNote ?? '', attachmentNotes: action?.attachmentNotes ?? '', cancellationReason: '',
    };
    setSelected(action); setMode(nextMode); setDraft(next); setInitialDraft(JSON.stringify(next));
    setFields({}); setError(''); setNotice(''); setNeedsLatest(false); setLatest(null); setHistory(null); setHistoryError(false);
  };
  const change = (key: keyof Draft, value: string | boolean) => { setDraft(prev => prev ? { ...prev, [key]: value } : prev); setFields(prev => ({ ...prev, [key]: '' })); };
  function validate(): boolean {
    if (!draft) return false;
    const errors: Record<string, string> = {};
    if (mode === 'cancel') {
      if (size(draft.cancellationReason) < 1 || size(draft.cancellationReason) > 1000) errors.cancellationReason = 'Enter a cancellation reason (1–1000 characters).';
    } else {
      const date = new Date(`${draft.actionAt}+07:00`);
      if (!draft.actionAt || !Number.isFinite(date.getTime()) || date > new Date() || (ticketCreatedAt && date < new Date(ticketCreatedAt))) errors.actionAt = 'Choose an action time between Ticket creation and now (Asia/Bangkok).';
      if (size(draft.description) < 1 || size(draft.description) > 2000) errors.description = 'Enter a description (1–2000 characters).';
      if (size(draft.result) > 2000 || ((mode === 'complete' || selected?.status === 'COMPLETED') && !size(draft.result))) errors.result = 'Completion requires a result; maximum 2000 characters.';
      if (draft.followUpRequired && (size(draft.followUpNote) < 1 || size(draft.followUpNote) > 1000)) errors.followUpNote = 'Enter a follow-up note (1–1000 characters).';
      if (size(draft.attachmentNotes) > 1000) errors.attachmentNotes = 'Use at most 1000 characters.';
      if ((mode === 'create' || mode === 'complete' || selected?.status !== 'COMPLETED') && !users.some(u => u.id === draft.assigneeId)) errors.assigneeId = 'Choose an active IT Staff or Administrator.';
    }
    setFields(errors);
    if (Object.keys(errors).length) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return false; }
    return true;
  }
  async function save(startAction?: ActionTaken) {
    if (inFlight.current || !data) return;
    if (!startAction && !uncertain && !validate()) return;
    const action = startAction ?? selected;
    let body: ActionWrite;
    if (uncertain) body = uncertain.body;
    else if (startAction) body = { expectedTicketVersion: data.ticketVersion, expectedVersion: startAction.version, status: 'IN_PROGRESS' };
    else if (mode === 'cancel') body = { expectedTicketVersion: data.ticketVersion, expectedVersion: action!.version, status: 'CANCELLED', cancellationReason: draft!.cancellationReason.trim() };
    else {
      body = { expectedTicketVersion: data.ticketVersion, actionAt: selected && draft!.actionAt === bangkokInput(selected.actionAt) ? selected.actionAt : new Date(`${draft!.actionAt}+07:00`).toISOString(), description: draft!.description.trim(), result: blank(draft!.result), followUpRequired: draft!.followUpRequired, followUpNote: draft!.followUpRequired ? blank(draft!.followUpNote) : null, attachmentNotes: blank(draft!.attachmentNotes) };
      if (mode !== 'create') body.expectedVersion = action!.version;
      if (mode === 'create' || action?.status !== 'COMPLETED') body.assigneeId = draft!.assigneeId;
      if (mode === 'complete') body.status = 'COMPLETED';
    }
    const creating = !startAction && mode === 'create';
    const key = creating ? uncertain?.key ?? crypto.randomUUID() : '';
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (creating) await createAction(ticketId, body, key); else await updateAction(ticketId, action!.id, body);
      if (!alive.current) return;
      closeForm(); setSelected(null); setHistory(null); setNotice('Action saved successfully.');
      await load();
      if (refreshTicket) { try { await refreshTicket(); } catch { setError('Action saved, but Ticket details could not be refreshed. Refresh the Ticket before further work.'); } }
    } catch (err) {
      if (!alive.current || handleFailure(err)) return;
      if (creating && (!(err instanceof ActionsError) || err.status >= 500)) {
        setUncertain({ body, key }); setError('The save outcome is uncertain. Retry the identical submission to check whether it succeeded. Editing and leaving are paused until this is resolved.');
      } else if (err instanceof ActionsError && err.status === 409) {
        setUncertain(null); setNeedsLatest(true);
        if (startAction) setSelected(startAction);
        setError('Another update or transaction conflict prevented this save. Load latest, review the saved values alongside your draft, then explicitly save again.');
      } else if (err instanceof ActionsError && err.status === 400) {
        setUncertain(null); setError('Check the action fields. The server rejected this submission; your draft has been retained.');
        const known = ['actionAt', 'description', 'result', 'assigneeId', 'followUpNote', 'attachmentNotes', 'cancellationReason'];
        setFields(Object.fromEntries(err.fields.filter(field => known.includes(field)).map(field => [field, 'Check this value against the field requirements.'])));
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      } else setError('The action could not be saved. Your draft is retained. Load latest before retrying.');
      if (!creating && !(err instanceof ActionsError && err.status === 400)) setNeedsLatest(true);
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function loadHistory(historyPage = 1) {
    if (!selected || !staff) return;
    setHistoryBusy(true); setHistoryError(false);
    try { const result = await getActionRevisions(ticketId, selected.id, historyPage); if (alive.current) setHistory(result); }
    catch (err) { if (alive.current && !handleFailure(err)) setHistoryError(true); }
    finally { if (alive.current) setHistoryBusy(false); }
  }
  const input = (key: keyof Draft, label: string, limit?: number, required = false, type = 'textarea') => <div className="action-field" key={key}>
    <label htmlFor={`action-${key}`}>{label}{required ? ' *' : ''}</label>
    {type === 'textarea' ? <textarea id={`action-${key}`} rows={3} value={String(draft![key])} onChange={e => change(key, e.target.value)} aria-required={required} aria-invalid={!!fields[key]} aria-describedby={`action-${key}-help`} /> :
      <input id={`action-${key}`} type={type} step={type === 'datetime-local' ? '1' : undefined} value={String(draft![key])} onChange={e => change(key, e.target.value)} aria-required={required} aria-invalid={!!fields[key]} aria-describedby={`action-${key}-help`} />}
    <small id={`action-${key}-help`} className={fields[key] ? 'action-error' : ''}>{fields[key] || (limit ? `Maximum ${limit} characters.` : 'Asia/Bangkok (UTC+07:00).')}</small>
  </div>;
  return <section id="actions-taken" ref={sectionRef} tabIndex={-1} className="actions-taken" aria-labelledby="actions-heading" aria-busy={loading || busy}>
    <div className="action-toolbar"><div><h3 id="actions-heading">Actions Taken</h3><p>Work recorded for this Ticket · Asia/Bangkok</p></div><div className="action-buttons">
      <button type="button" disabled={busy || loading || !!uncertain} onClick={() => void load(page, !!draft)}>Refresh actions</button>
      {staff && parentActive && !denied && data && <button className="primary" disabled={busy || loading || !!uncertain} onClick={event => begin('create', null, event.currentTarget)}>Add action</button>}
    </div></div>
    {!parentActive && staff && <p>Actions are read-only. Reopen the Ticket before recording new work.</p>}
    <div role="status" aria-live="polite">{loading ? 'Loading actions…' : notice}</div>
    {error && <div className="action-alert" role="alert">{error}
      {needsLatest && <div className="action-buttons"><button disabled={busy || loading} onClick={() => void load(page, true)}>Load latest</button></div>}
      {!needsLatest && !uncertain && !denied && !draft && <div><button disabled={loading} onClick={() => void load()}>Retry loading actions</button></div>}
    </div>}
    {!denied && data && <>
      {!loading && data.pagination.totalCount === 0 && <p>No actions yet.</p>}
      {data.actions.length > 0 && <table aria-label="Actions Taken records"><thead><tr>{['Action time', 'Description', 'Result', 'Performed by', 'Assigned to', 'Status', 'Follow-up', 'View / Edit'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.actions.map(action => <tr key={action.id}>
          <td data-label="Action time">{dateLabel(action.actionAt)}</td><td data-label="Description">{action.description}</td><td data-label="Result">{action.result || 'No result recorded yet'}</td>
          <td data-label="Performed by">{action.performedBy.name}</td><td data-label="Assigned to">{action.assignee.name}{!action.assignee.isActive && ' (inactive)'}</td>
          <td data-label="Status" className="action-status">{labels[action.status]} · Cycle {action.resolutionCycle}</td><td data-label="Follow-up">{action.followUpRequired ? 'Yes' : 'No'}</td>
          <td data-label="View / Edit"><button aria-label={`View action: ${action.description}`} disabled={busy || historyBusy || !!uncertain} onClick={() => { if (!canLeave()) return; closeForm(); setSelected(action); setHistory(null); setHistoryError(false); }}>View action</button></td>
        </tr>)}</tbody></table>}
      {data.pagination.totalCount > 0 && <div className="action-toolbar"><span>Page {page} of {Math.max(1, Math.ceil(data.pagination.totalCount / data.pagination.pageSize))} · {data.pagination.totalCount} actions</span><div className="action-buttons">
        <button disabled={page <= 1 || busy || loading || !!uncertain} onClick={() => { if (canLeave()) { closeForm(); setSelected(null); setPage(page - 1); void load(page - 1); } }}>Previous actions</button>
        <button disabled={page * data.pagination.pageSize >= data.pagination.totalCount || busy || loading || !!uncertain} onClick={() => { if (canLeave()) { closeForm(); setSelected(null); setPage(page + 1); void load(page + 1); } }}>Next actions</button>
      </div></div>}
      {selected && !mode && <div className="action-detail" aria-label="Action details"><h4>Action details</h4><ActionValues action={selected} />
        {selected.resolutionCycle !== data.resolutionCycle && <p>Previous resolution cycle — read-only</p>}
        {!selected.assignee.isActive && ['PLANNED', 'IN_PROGRESS'].includes(selected.status) && <p>Reassign this action to active staff before completion.</p>}
        <div className="action-buttons">
          {editable(selected) && <button disabled={busy || loading || needsLatest} onClick={event => begin('edit', selected, event.currentTarget)}>Edit action</button>}
          {editable(selected) && selected.status === 'PLANNED' && <button disabled={busy || loading || needsLatest} onClick={() => void save(selected)}>Start action</button>}
          {editable(selected) && selected.status !== 'COMPLETED' && <><button disabled={busy || loading || needsLatest} onClick={event => begin('complete', selected, event.currentTarget)}>Complete action</button><button disabled={busy || loading || needsLatest} onClick={event => begin('cancel', selected, event.currentTarget)}>Cancel action</button></>}
          {staff && <button disabled={historyBusy || busy} onClick={() => { if (history) setHistory(null); else void loadHistory(); }}>{history ? 'Hide change history' : 'Change history'}</button>}
        </div>
        {historyBusy && <p role="status">Loading change history…</p>}
        {historyError && <div role="alert">Change history could not be loaded. <button onClick={() => void loadHistory()}>Retry history</button></div>}
        {staff && history && <div aria-label="Change history"><h4>Change history</h4>{history.revisions.map(revision => <details key={revision.revision}><summary>Revision {revision.revision} · {revision.actor.name} · {dateLabel(revision.createdAt)}</summary><dl>{Object.entries(revision.snapshot).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? 'None' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</dd></div>)}</dl></details>)}
          <div className="action-buttons"><button disabled={historyBusy || history.pagination.page <= 1} onClick={() => void loadHistory(history.pagination.page - 1)}>Previous revisions</button><button disabled={historyBusy || history.pagination.page * history.pagination.pageSize >= history.pagination.totalCount} onClick={() => void loadHistory(history.pagination.page + 1)}>Next revisions</button></div>
        </div>}
      </div>}
      {draft && mode && staff && <form ref={formRef} className="action-form" aria-label={`${mode} action`} noValidate onSubmit={e => { e.preventDefault(); void save(); }} onKeyDown={e => { if (e.key === 'Escape' && !busy && !uncertain && canLeave()) { e.preventDefault(); closeForm(); } }}>
        <h4>{mode === 'create' ? 'New action' : mode === 'complete' ? 'Complete action' : mode === 'cancel' ? 'Cancel action' : 'Edit action'}</h4>
        <p>Fields marked * are required. Performed by: <strong>{selected?.performedBy.name ?? user?.name}</strong> (read-only)</p>
        {latest && <details><summary>Latest saved values — your draft is retained below</summary><ActionValues action={latest} /></details>}
        <fieldset disabled={busy || !!uncertain}><div className="action-grid">
          {mode === 'cancel' ? <>{input('cancellationReason', 'Cancellation reason', 1000, true)}<p>Confirm cancellation of this action. Its saved history will remain available.</p></> : <>
            {input('actionAt', 'Action time (Asia/Bangkok)', undefined, true, 'datetime-local')}
            <div className="action-field"><label htmlFor="action-assigneeId">Assigned to *</label><select id="action-assigneeId" value={draft.assigneeId} disabled={selected?.status === 'COMPLETED' || usersError} aria-invalid={!!fields.assigneeId} aria-describedby="action-assignee-help" onChange={e => change('assigneeId', e.target.value)}>
              {!users.some(u => u.id === draft.assigneeId) && <option value={draft.assigneeId}>{selected?.assignee.name ?? user?.name} (not available for new assignment)</option>}
              {users.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}
            </select><small id="action-assignee-help" className={fields.assigneeId ? 'action-error' : ''}>{fields.assigneeId || (selected?.status === 'COMPLETED' ? 'Assignment is fixed for completed work.' : 'Active IT Staff and Administrators.')}</small>
              {usersError && <p role="alert">Assignees could not be loaded. <button type="button" onClick={() => void loadUsers()}>Retry assignees</button></p>}
            </div>
            {input('description', 'Description', 2000, true)}{input('result', 'Result', 2000, mode === 'complete' || selected?.status === 'COMPLETED')}
            <div><label className="action-check"><input type="checkbox" checked={draft.followUpRequired} onChange={e => change('followUpRequired', e.target.checked)} />Follow-up required: {draft.followUpRequired ? 'Yes' : 'No'}</label>
              {!draft.followUpRequired && <p>The current follow-up note will clear when saved. Earlier values remain in change history.</p>}
            </div>
            {draft.followUpRequired && input('followUpNote', 'Follow-up note', 1000, true)}
            {input('attachmentNotes', 'Attachment Notes', 1000)}
            <p>Status: {mode === 'create' ? 'Planned (read-only)' : mode === 'complete' ? 'Completed after confirmation' : labels[selected!.status]}. Attachment Notes refer to existing Ticket attachments.</p>
          </>}
        </div></fieldset>
        <div className="action-buttons"><button className="primary" type="submit" disabled={busy || loading || needsLatest || (!uncertain && mode === 'edit' && !dirty) || (!uncertain && !parentActive)}>{busy ? 'Saving…' : uncertain ? 'Retry identical submission' : mode === 'complete' ? 'Confirm completion' : mode === 'cancel' ? 'Confirm cancellation' : 'Save action'}</button>
          <button type="button" disabled={busy || !!uncertain} onClick={() => { if (canLeave()) closeForm(); }}>Discard / Cancel</button></div>
      </form>}
      {busy && <p role="status">Saving…</p>}
    </>}
  </section>;
}

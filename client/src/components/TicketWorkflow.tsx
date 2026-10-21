import { useEffect, useRef, useState } from 'react';
import { StaffTicketDetailData, StaffUserItem, updateStaffTicketOwner, updateStaffTicketPriority, updateStaffTicketStatus } from '../api';
import { useAuth } from '../context/AuthContext';
import { gateMessages, accessFailure } from '../workflow-feedback';
import WorkflowDialog from './WorkflowDialog';
import './TicketWorkflow.css';

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  New: ['Open', 'In Progress', 'Cancelled'], Open: ['In Progress', 'Waiting for Requester', 'Cancelled'],
  'In Progress': ['Waiting for Requester', 'Resolved', 'Cancelled'], 'Waiting for Requester': ['In Progress', 'Resolved', 'Cancelled'],
  Resolved: ['Closed', 'Reopened'], Closed: ['Reopened'], Reopened: ['In Progress', 'Waiting for Requester', 'Cancelled'], Cancelled: [],
};
const canonical = (value: string) => Object.keys(ALLOWED_STATUS_TRANSITIONS).find(status => status.toLowerCase() === value.toLowerCase().replaceAll('_', ' ')) ?? value;
type Change = { kind: 'status' | 'owner' | 'priority'; value: string; version: number | undefined };
type Props = {
  ticketId: string | number; ticket: StaffTicketDetailData; staffUsers: StaffUserItem[];
  currentUser?: { role: string }; refreshTicket: () => Promise<StaffTicketDetailData>;
  onAccessError: (error: unknown) => void; blocked?: boolean;
};

export default function TicketWorkflow({ ticketId, ticket, staffUsers, currentUser, refreshTicket, onAccessError, blocked = false }: Props) {
  const auth = useAuth();
  const staff = ['IT_STAFF', 'ADMINISTRATOR'].includes((currentUser ?? auth.user)?.role.toUpperCase() ?? '');
  const [pending, setPending] = useState<Change | null>(null);
  const [reason, setReason] = useState(''), [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [needsLatest, setNeedsLatest] = useState(false), [saved, setSaved] = useState(false);
  const [latest, setLatest] = useState<StaffTicketDetailData | null>(null), [denied, setDenied] = useState('');
  const inFlight = useRef(false), alive = useRef(true), reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const currentStatus = canonical(ticket.status || ticket.currentStatus);
  const targets = (ticket.allowedTransitions ?? ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [])
    .filter(target => ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(target));
  const gate = ticket.resolutionGate;
  const confirmation = pending?.kind === 'status' && ['Cancelled', 'Reopened'].includes(pending.value) && !saved;
  const applicable = !pending || (pending.kind !== 'status' || targets.includes(pending.value)) && (pending.value !== 'Resolved' || !!gate?.eligible);

  function discard() {
    if (inFlight.current || (reason.trim() && !window.confirm('Discard unsaved ticket changes?'))) return;
    setPending(null); setReason(''); setReasonError(''); setError(''); setNeedsLatest(false); setLatest(null); setSaved(false);
  }
  useEffect(() => {
    const guard = (event: Event) => {
      if (inFlight.current || (pending && !window.confirm('Discard unsaved ticket changes?'))) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { if (pending || inFlight.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('toktickit:before-navigate', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('toktickit:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, [pending]);

  function fail(err: any) {
    const access = accessFailure(err);
    if (access) { setPending(null); setReason(''); setLatest(null); setDenied(access); onAccessError(err); return; }
    const code = err?.error?.code;
    setNeedsLatest(true);
    setError(code === 'INVALID_TRANSITION' ? 'This status transition is no longer allowed. Load the latest ticket and review your choice.'
      : code === 'RESOLUTION_BLOCKED' ? 'Resolution is blocked. Review the current cycle actions and load the latest ticket.'
      : code === 'STALE_VERSION' || code === 'RETRYABLE_CONFLICT' || err?.status === 409 ? 'This ticket changed while you were working. Your input is retained. Load the latest ticket before retrying.'
      : code === 'VALIDATION_ERROR' ? 'Check your selection and cancellation reason. Load the latest ticket before retrying.'
      : 'The change could not be confirmed. Your input is retained. Load the latest ticket to check its saved state before retrying.');
  }
  async function loadLatest() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const fresh = await refreshTicket();
      if (!alive.current) return;
      setLatest(pending ? fresh : null); setNeedsLatest(false); setError('');
      if (saved) { setSaved(false); setNotice('Ticket refreshed successfully.'); }
      else { setPending(prev => prev ? { ...prev, version: fresh.version } : null); if (!pending) setNotice('Ticket refreshed successfully.'); }
    } catch (err) { if (alive.current) fail(err); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function save(change: Change) {
    if (inFlight.current || blocked || needsLatest || !staff) return;
    if (change.kind === 'status' && change.value === 'Cancelled' && (!reason.trim() || [...reason.trim()].length > 1000)) {
      setReasonError('Enter a cancellation reason (1–1000 characters).'); reasonRef.current?.focus(); return;
    }
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    let written = false;
    try {
      if (change.kind === 'owner') await updateStaffTicketOwner(ticketId, change.value === 'unassigned' ? null : change.value, change.version);
      else if (change.kind === 'priority') await updateStaffTicketPriority(ticketId, change.value, change.version);
      else if (change.value === 'Cancelled') await updateStaffTicketStatus(ticketId, change.value, change.version, reason.trim());
      else await updateStaffTicketStatus(ticketId, change.value, change.version);
      written = true;
      if (!alive.current) return;
      setPending(null); setReason(''); setReasonError(''); setLatest(null);
      setNotice(change.kind === 'status' ? `Status changed to ${change.value}` : change.kind === 'owner' ? 'Owner updated successfully' : 'IT Priority updated successfully');
      await refreshTicket();
    } catch (err) {
      if (!alive.current) return;
      if (written && !accessFailure(err)) { setSaved(true); setNeedsLatest(true); setError('The change was saved, but the view could not refresh. Load the latest ticket.'); }
      else fail(err);
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function choose(kind: Change['kind'], value: string) {
    if (inFlight.current || blocked || pending) return;
    if (kind === 'status' && (!targets.includes(value) || (value === 'Resolved' && !gate?.eligible))) return;
    const change = { kind, value, version: ticket.version };
    setPending(change); setError(''); setNotice(''); setLatest(null); setSaved(false);
    if (kind === 'status' && ['Cancelled', 'Reopened'].includes(value)) return;
    void save(change);
  }
  const feedback = <>
{error && <div role="alert" className="workflow-message" data-testid="status-error-message">{error}</div>}
    {latest && <div className="workflow-message"><strong>Latest saved ticket — your input is retained</strong>
      <p>Status: {latest.status || latest.currentStatus} · Owner: {latest.owner?.name ?? 'Unassigned'} · IT Priority: {latest.itPriority} · Cycle {latest.resolutionCycle ?? 1}</p>
      {pending && <p>Your requested {pending.kind}: {pending.value}</p>}
      {!applicable && <p>Your requested status is no longer available. Discard this change and choose an allowed transition.</p>}
    </div>}
    {needsLatest && <button type="button" className="btn btn-outline-success mt-2" disabled={busy} onClick={() => void loadLatest()}>Load latest ticket</button>}
  </>;
  if (!staff) return null;
  if (denied) return <p role="alert">{denied}</p>;
  return <section className="ticket-workflow" tabIndex={-1} data-testid="operational-controls" aria-label="Ticket workflow" aria-busy={busy}>
    <h3>Operational Controls (Editable)</h3>
    <p>Changes save immediately. Cancellation and reopening require confirmation.</p>
    {!pending && !needsLatest && <button type="button" className="btn btn-outline-success mb-3" disabled={busy} onClick={() => void loadLatest()}>Refresh ticket</button>}
    {notice && <p role="status" className="alert alert-success">{notice}</p>}
    <div className="workflow-controls">
      <div><label htmlFor="staff-owner-select">Ticket Owner</label>
        <select id="staff-owner-select" data-testid="editable-owner-select" style={{ backgroundColor: '#FFFFFF' }} value={pending?.kind === 'owner' ? pending.value : ticket.owner?.id ?? 'unassigned'} disabled={busy || blocked || !!pending || needsLatest} onChange={e => choose('owner', e.target.value)}>
          <option value="unassigned">-- Unassigned --</option>
          {staffUsers.map(user => <option key={user.id} value={user.id}>{user.name} ({user.role === 'ADMINISTRATOR' ? 'Admin' : 'Staff'})</option>)}
          {ticket.owner && !staffUsers.some(user => user.id === ticket.owner?.id) && <option value={ticket.owner.id}>{ticket.owner.name}</option>}
        </select><small>Assign to active IT Staff or Administrator</small></div>
      <div><label htmlFor="staff-priority-select">IT Priority</label>
        <select id="staff-priority-select" data-testid="editable-priority-select" style={{ backgroundColor: '#FFFFFF' }} value={pending?.kind === 'priority' ? pending.value : (ticket.itPriority || 'MEDIUM').toUpperCase()} disabled={busy || blocked || !!pending || needsLatest} onChange={e => choose('priority', e.target.value)}>
          <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
        </select><small>Operational priority managed by IT</small></div>
      <div><label htmlFor="staff-status-select">Current Status</label>
        <select id="staff-status-select" data-testid="editable-status-select" style={{ backgroundColor: '#FFFFFF' }} value={currentStatus} disabled={busy || blocked || !!pending || needsLatest || !targets.length} onChange={e => choose('status', e.target.value)}>
          <option value={currentStatus}>{currentStatus} (Current)</option>
          {targets.map(target => <option key={target} value={target} disabled={target === 'Resolved' && !gate?.eligible}>→ Move to {target}{target === 'Resolved' && !gate?.eligible ? ' (requirements not met)' : ''}</option>)}
        </select><small>{targets.length ? `${targets.length} valid next state(s)` : 'Terminal status — no further transitions'}</small></div>
    </div>
    <div className="resolution-gate" aria-label="Resolution requirements">
      <strong>Resolution cycle {ticket.resolutionCycle ?? 1}</strong>
      {ticket.resolvedAt && <p>Resolved at {new Date(ticket.resolvedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })} (Asia/Bangkok)</p>}
      {gate ? <><p>{gate.completedCount} completed · {gate.unfinishedCount} unfinished · {gate.followUpCount} requiring follow-up</p>
        {gate.eligible ? <p>Resolution requirements met.</p> : <ul>{gate.blockers.map(blocker => <li key={blocker}>{gateMessages[blocker] ?? 'Review the current cycle actions before resolving.'}</li>)}</ul>}</> : <p>Load the latest ticket to check resolution requirements.</p>}
      <a href="#actions-taken">Review Actions Taken</a>
      <p>Requester “Problem Appears Resolved” is advisory; IT Staff decides the formal status.</p>
    </div>
    {!confirmation && feedback}
    {pending && !confirmation && <div className="workflow-buttons">
      <button type="button" className="btn btn-success" disabled={busy || blocked || needsLatest || !applicable} onClick={() => void save(pending)}>Retry ticket change</button>
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={discard}>Discard ticket change</button>
    </div>}
    {confirmation && pending && <WorkflowDialog title={pending.value === 'Cancelled' ? 'Cancel ticket' : 'Reopen ticket'} returnFocusId="staff-status-select" busy={busy} onDismiss={discard}>
      {pending.value === 'Cancelled' ? <><p>Cancel this ticket and all Planned or In Progress actions in the current cycle. Completed actions remain in history.</p>
        <label htmlFor="ticket-cancel-reason">Ticket cancellation reason *</label>
        <textarea ref={reasonRef} id="ticket-cancel-reason" value={reason} disabled={busy} aria-invalid={!!reasonError} aria-describedby={reasonError ? 'ticket-reason-error' : undefined} onChange={e => { setReason(e.target.value); setReasonError(''); }} />
        {reasonError && <p id="ticket-reason-error" role="alert">{reasonError}</p>}</> : <p>Reopening starts a new resolution cycle and clears the previous resolution time and Requester advisory. Previous actions remain read-only history. Complete new work before resolving again.</p>}
      {feedback}
      <div className="workflow-buttons">
        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={discard}>Keep current status</button>
        <button type="button" className="btn btn-success" disabled={busy || blocked || needsLatest || !applicable} onClick={() => void save(pending)}>{busy ? 'Saving ticket…' : pending.value === 'Cancelled' ? 'Confirm ticket cancellation' : 'Confirm ticket reopening'}</button>
      </div>
    </WorkflowDialog>}
  </section>;
}

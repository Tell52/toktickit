import { useEffect, useRef, useState } from 'react';
import { getTicketStatusHistory, TicketStatusEvent } from '../api';
import { accessFailure } from '../workflow-feedback';
import './TicketWorkflow.css';

export default function TicketStatusHistory({ ticketId, refreshKey, onAccessError }: {
  ticketId: string | number; refreshKey?: number; onAccessError?: (error: unknown) => void;
}) {
  const [events, setEvents] = useState<TicketStatusEvent[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sequence = useRef(0);
  async function load(target: number) {
    const request = ++sequence.current;
    setBusy(true); setError('');
    try {
      const result = await getTicketStatusHistory(ticketId, target);
      if (request !== sequence.current) return;
      setEvents(result.events); setTotal(result.pagination.totalCount); setPage(target);
    } catch (err) {
      if (request !== sequence.current) return;
      const denied = accessFailure(err);
      if (denied) { setEvents([]); setTotal(0); onAccessError?.(err); }
      setError(denied || 'Status history could not be loaded. Please retry.');
    } finally { if (request === sequence.current) setBusy(false); }
  }
  useEffect(() => { void load(1); return () => { sequence.current++; }; }, [ticketId, refreshKey]);
  return <section className="ticket-status-history" aria-label="Ticket status history" aria-busy={busy}>
    <h3>Status history</h3>
    {error && <p role="alert">{error}</p>}
    {!error && !busy && !events.length && <p>No status changes recorded yet.</p>}
    <ol>{events.map(event => <li key={event.id}>
      <strong>{event.fromStatus} → {event.toStatus}</strong> · {event.actor.name} · Cycle {event.resolutionCycle}
      <div>{new Date(event.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })} (Asia/Bangkok)</div>
      {event.reason && <div>Reason: {event.reason}</div>}
    </li>)}</ol>
    <div className="workflow-buttons">
      <button type="button" className="btn btn-outline-success" disabled={busy} onClick={() => void load(page)}>Refresh status history</button>
      {total > 20 && <><button type="button" disabled={busy || page === 1} onClick={() => void load(page - 1)}>Previous status changes</button>
        <span>Page {page} of {Math.ceil(total / 20)}</span>
        <button type="button" disabled={busy || page * 20 >= total} onClick={() => void load(page + 1)}>Next status changes</button></>}
    </div>
  </section>;
}

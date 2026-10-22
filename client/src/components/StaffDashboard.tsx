import { useEffect, useState } from 'react';
import { DashboardTicket, getStaffDashboard, getMyStaffActions, StaffDashboardData, StaffActionsData } from '../api';
import { useAuth } from '../context/AuthContext';
import { accessFailure } from '../workflow-feedback';
import './RequesterDashboard.css';

export function staffDrilldowns(data: StaffDashboardData) {
  const link = (params: Record<string, string>) => `/queue?${new URLSearchParams(params)}`;
  return { unassignedTickets: link({ statusGroup: 'active', owner: 'unassigned' }), myTickets: link({ statusGroup: 'active', owner: 'me' }), recentlyUpdated: link({ updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' }), myActiveActions: '#my-actions' };
}
const time = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
export default function StaffDashboard({ onNavigate, query = "" }: { onNavigate: (url: string) => void; query?: string }) {
  const auth = useAuth();
  const rawPage = new URLSearchParams(query).get('actionsPage') ?? '1';
  const validPage = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000000;
  const page = validPage ? Number(rawPage) : 1;
  const [actions, setActions] = useState<StaffActionsData | null>(null);
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [denied, setDenied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const update = () => setRefresh(n => n + 1);
    window.addEventListener('focus', update); window.addEventListener('pageshow', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('pageshow', update); };
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    Promise.all([getStaffDashboard(), page === 1 ? Promise.resolve(null) : getMyStaffActions(page)]).then(([result, actionPage]) => { if (current) { setData(result); setActions(actionPage ?? result.myActions); setDenied(false); } }).catch(err => {
      if (!current) return;
      const access = accessFailure(err);
      if (access) {
        setData(null); setActions(null); setDenied(true); setError(access.replace('this ticket', 'this dashboard'));
        if (err?.status === 401 || err?.error?.code === 'UNAUTHENTICATED') { localStorage.removeItem('csrfToken'); auth.invalidateSession?.(); }
        else void auth.checkAuth();
      } else setError('Dashboard could not be refreshed. Please try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh, auth.user?.id, auth.user?.role, page]);
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(href);
  };
  const ticketList = (title: string, tickets: DashboardTicket[], empty: string) => <section className="dashboard-preview" aria-label={title}>
    <h3>{title}</h3>
    {tickets.length ? <ul>{tickets.map(ticket => <li key={ticket.id}>
      <a href={`/tickets/${ticket.id}`} onClick={e => navigate(e, `/tickets/${ticket.id}`)}><strong>{ticket.ticketNumber}</strong> — {ticket.summary}</a>
      <div>{ticket.currentStatus} · Updated <time dateTime={ticket.updatedAt}>{time(ticket.updatedAt)}</time></div>
    </li>)}</ul> : <p>{empty}</p>}
  </section>;
  const links = data && staffDrilldowns(data);
  const labels = { unassignedTickets: 'Unassigned open tickets', myTickets: 'My open tickets', recentlyUpdated: 'Updated in last 7 days', myActiveActions: 'Actions assigned to me' };
  return <div className="requester-dashboard staff-dashboard" aria-busy={loading}>
    <div className="dashboard-heading"><div><h2>Service desk dashboard</h2><p>Support work at a glance</p></div>
      <button className="btn btn-outline-success" disabled={loading || denied} onClick={() => setRefresh(n => n + 1)}>Refresh dashboard</button>
    </div>
    {loading && <p role="status">Loading dashboard…</p>}
    {error && <div role="alert" className="alert alert-danger">{error}{!denied && <button className="btn btn-outline-success ms-2" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Retry dashboard</button>}</div>}
    {data && links && <>
      <p>Updated <time dateTime={data.asOf}>{time(data.asOf)}</time> · Last 7 days · Asia/Bangkok{error && ' · Showing the last successful update'}</p>
      <div className="dashboard-metrics">{(Object.keys(labels) as (keyof typeof labels)[]).map(key => <a key={key} href={links[key]} onClick={e => { if (key === 'myActiveActions') { e.preventDefault(); document.getElementById('my-actions')?.focus(); } else navigate(e, links[key]); }}>
        <span>{labels[key]}</span><strong>{data.metrics[key]}</strong>
      </a>)}</div>
      <p>Counts include all matching tickets. Each preview shows up to five; opening a list fetches current data.</p>
      <div className="dashboard-previews">{ticketList('Urgent tickets', data.urgentTickets, 'No urgent tickets.')}{ticketList('Recently updated', data.recentTickets, 'No tickets updated in this period.')}</div>
      <div className="dashboard-previews">{(['byStatus', 'byPriority'] as const).map(group => <section className="dashboard-preview" key={group} aria-label={group === 'byStatus' ? 'Tickets by status' : 'Open tickets by IT priority'}>
        <h3>{group === 'byStatus' ? 'Tickets by status' : 'Open tickets by IT priority'}</h3>
        <ul>{Object.entries(data.metrics[group]).map(([label, count]) => { const href = `/queue?${new URLSearchParams(group === 'byStatus' ? { status: label } : { statusGroup: 'active', priority: label })}`; return <li key={label}><a href={href} onClick={e => navigate(e, href)}>{label}: {count}</a></li>; })}</ul>
      </section>)}</div>
      <section className="dashboard-preview" id="my-actions" tabIndex={-1} aria-label="My actions"><h3>My actions</h3>
        {!validPage && <p role="alert">Invalid actions page. Showing page 1.</p>}
        {actions && <><p>Page {actions.pagination.page} · {actions.pagination.totalCount} actions</p>
          {actions.actions.length ? <ul>{actions.actions.map(action => { const href = `/tickets/${action.ticketId}?tab=actions&actionId=${encodeURIComponent(action.id)}`; return <li key={action.id}><a href={href} onClick={e => navigate(e, href)}>{action.ticketNumber} — {action.description}</a><div>{action.status.replaceAll('_', ' ')} · <time dateTime={action.actionAt}>{time(action.actionAt)}</time></div></li>; })}</ul> : <p>No active actions on this page.</p>}
          <div className="d-flex flex-wrap gap-2"><button disabled={loading || page <= 1} onClick={() => onNavigate(`/dashboard?actionsPage=${page - 1}`)}>Previous actions</button><button disabled={loading || page * 5 >= actions.pagination.totalCount} onClick={() => onNavigate(`/dashboard?actionsPage=${page + 1}`)}>Next actions</button></div>
        </>}
      </section>
    </>}
  </div>;
}

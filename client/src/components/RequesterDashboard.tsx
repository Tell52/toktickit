import { useEffect, useState } from 'react';
import { DashboardTicket, getRequesterDashboard, RequesterDashboardData } from '../api';
import { useAuth } from '../context/AuthContext';
import { accessFailure } from '../workflow-feedback';
import './RequesterDashboard.css';

export function requesterDrilldowns(data: RequesterDashboardData) {
  const link = (params: Record<string, string>) => `/tickets?${new URLSearchParams(params)}`;
  return {
    openTickets: link({ statusGroup: 'active' }),
    waitingForRequester: link({ status: 'Waiting for Requester' }),
    recentlyUpdated: link({ updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' }),
    recentlyResolved: link({ statusGroup: 'resolved', resolvedFrom: data.window.since, resolvedBefore: data.window.before, sort: '-resolvedAt' }),
  };
}
const time = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
export default function RequesterDashboard({ onNavigate }: { onNavigate: (url: string) => void }) {
  const auth = useAuth();
  const [data, setData] = useState<RequesterDashboardData | null>(null);
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
    getRequesterDashboard().then(result => { if (current) { setData(result); setDenied(false); } }).catch(err => {
      if (!current) return;
      const access = accessFailure(err);
      if (access) {
        setData(null); setDenied(true); setError(access.replace('this ticket', 'this dashboard'));
        if (err?.status === 401 || err?.error?.code === 'UNAUTHENTICATED') { localStorage.removeItem('csrfToken'); auth.invalidateSession?.(); }
        else void auth.checkAuth();
      } else setError('Dashboard could not be refreshed. Please try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh, auth.user?.id]);
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
  const links = data && requesterDrilldowns(data);
  const labels = { openTickets: 'Open tickets', waitingForRequester: 'Waiting for you', recentlyUpdated: 'Updated in last 7 days', recentlyResolved: 'Resolved in last 7 days' };
  return <div className="requester-dashboard" aria-busy={loading}>
    <div className="dashboard-heading"><div><h2>Dashboard</h2><p>Your tickets at a glance</p></div>
      <button className="btn btn-outline-success" disabled={loading || denied} onClick={() => setRefresh(n => n + 1)}>Refresh dashboard</button>
    </div>
    {loading && <p role="status">Loading dashboard…</p>}
    {error && <div role="alert" className="alert alert-danger">{error}{!denied && <button className="btn btn-outline-success ms-2" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Retry dashboard</button>}</div>}
    {data && links && <>
      <p>Updated <time dateTime={data.asOf}>{time(data.asOf)}</time> · Last 7 days · Asia/Bangkok{error && ' · Showing the last successful update'}</p>
      <div className="dashboard-metrics">{(Object.keys(labels) as (keyof typeof labels)[]).map(key => <a key={key} href={links[key]} onClick={e => navigate(e, links[key])}>
        <span>{labels[key]}</span><strong>{data.metrics[key]}</strong>
      </a>)}</div>
      <p>Counts include all matching tickets. Each preview shows up to five; opening a list fetches current data.</p>
      <div className="dashboard-previews">{ticketList('Waiting for you', data.attentionTickets, 'No tickets need your attention.')}{ticketList('Recently updated', data.recentTickets, 'No tickets updated in this period.')}</div>
      <a className="btn btn-success" href="/create-ticket" onClick={e => navigate(e, '/create-ticket')}>Create a ticket</a>
    </>}
  </div>;
}

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffDashboard from '../../src/components/StaffDashboard';
import StaffTicketQueue from '../../src/components/StaffTicketQueue';
import App from '../../src/App';
import * as api from '../../src/api';
import { AuthContext } from '../../src/context/AuthContext';
vi.mock('../../src/api');
const user = { id: 'staff', name: 'Staff One', email: 'staff@example.com', role: 'IT_STAFF', mustChangePassword: false };
const checkAuth = vi.fn(), invalidateSession = vi.fn();
const data: api.StaffDashboardData = { asOf: '2026-10-20T10:00:00Z', timeZone: 'Asia/Bangkok', window: { since: '2026-10-13T17:00:00Z', before: '2026-10-20T10:00:00Z' }, metrics: { unassignedTickets: 2, myTickets: 3, recentlyUpdated: 10, myActiveActions: 6, byStatus: { New: 0, Open: 3 }, byPriority: { Low: 0, Medium: 0, High: 3 } }, urgentTickets: [], recentTickets: [], myActions: { actions: [{ id: 'action-1', ticketId: 7, ticketNumber: 'T7', description: 'Investigate router', status: 'PLANNED', actionAt: '2026-10-20T09:00:00Z' } as any], pagination: { page: 1, pageSize: 5, totalCount: 6 } } };
function auth(child: React.ReactNode, role = 'IT_STAFF') { return <AuthContext.Provider value={{ user: { ...user, role }, loading: false, login: vi.fn(), logout: vi.fn(), checkAuth, invalidateSession }}>{child}</AuthContext.Provider>; }
function show(query = '') { const navigate = vi.fn(); render(auth(<StaffDashboard query={query} onNavigate={navigate} />)); return navigate; }
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState({}, '', '/'); vi.mocked(api.getStaffDashboard).mockResolvedValue(structuredClone(data)); vi.mocked(api.getCategories).mockResolvedValue([]); vi.mocked(api.getStaffTickets).mockResolvedValue({ tickets: [], pagination: { page: 1, pageSize: 10, totalCount: 0 } }); });
afterEach(cleanup);
describe('Staff dashboard', () => {
  it('renders exact drill-down bounds, zero buckets and focuses My actions', async () => {
    const navigate = show();
    const card = await screen.findByRole('link', { name: 'Unassigned open tickets 2' });
    fireEvent.click(card); expect(navigate).toHaveBeenCalledWith('/queue?statusGroup=active&owner=unassigned');
    expect(screen.getByRole('link', { name: 'My open tickets 3' })).toHaveAttribute('href', '/queue?statusGroup=active&owner=me');
    const url = new URL(screen.getByRole('link', { name: 'Updated in last 7 days 10' }).getAttribute('href')!, 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({ updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' });
    expect(screen.getByRole('link', { name: 'Low: 0' })).toHaveAttribute('href', '/queue?statusGroup=active&priority=Low');
    expect(screen.getByRole('link', { name: 'New: 0' })).toHaveAttribute('href', '/queue?status=New');
    fireEvent.click(screen.getByRole('link', { name: 'Actions assigned to me 6' })); expect(screen.getByRole('region', { name: 'My actions' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'T7 — Investigate router' })).toHaveAttribute('href', '/tickets/7?tab=actions&actionId=action-1');
  });
  it('uses the bounded action page and preserves the page in navigation', async () => {
    vi.mocked(api.getMyStaffActions).mockResolvedValue({ actions: [], pagination: { page: 2, pageSize: 5, totalCount: 6 } });
    const navigate = show('actionsPage=2'); await screen.findByText('Page 2 · 6 actions');
    expect(api.getMyStaffActions).toHaveBeenCalledWith(2); expect(screen.getByRole('button', { name: 'Next actions' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous actions' })); expect(navigate).toHaveBeenCalledWith('/dashboard?actionsPage=1');
  });
  it('announces loading without fabricated metrics', () => {
    vi.mocked(api.getStaffDashboard).mockReturnValue(new Promise(() => {})); show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard'); expect(screen.queryByRole('link', { name: /Unassigned open/ })).not.toBeInTheDocument();
  });
  it('shows safe errors and retries successfully', async () => {
    vi.mocked(api.getStaffDashboard).mockRejectedValueOnce(new Error('DATABASE_SECRET')); show();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('DATABASE_SECRET');
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' })); await screen.findByRole('link', { name: 'My open tickets 3' });
  });
  it.each([401, 403])('clears previously visible private data on %s', async status => {
    show(); await screen.findByRole('link', { name: 'My open tickets 3' });
    vi.mocked(api.getStaffDashboard).mockRejectedValue({ status }); fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'My open tickets 3' })).not.toBeInTheDocument());
    expect(screen.queryByText('Investigate router')).not.toBeInTheDocument(); expect(status === 401 ? invalidateSession : checkAuth).toHaveBeenCalled();
  });
  it('refreshes on returning focus and labels stale data on network failure', async () => {
    show(); await screen.findByRole('link', { name: 'My open tickets 3' });
    vi.mocked(api.getStaffDashboard).mockRejectedValue(new Error('offline')); fireEvent(window, new Event('focus'));
    await screen.findByText(/Showing the last successful update/); expect(screen.getByRole('link', { name: 'My open tickets 3' })).toBeInTheDocument();
  });
  it.each(['IT_STAFF', 'ADMINISTRATOR'])('lands %s on dashboard and retains queue navigation', async role => {
    render(auth(<App />, role)); await screen.findByRole('heading', { name: 'Service desk dashboard' });
    expect(window.location.pathname).toBe('/dashboard'); expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'My open tickets 3' }));
    await waitFor(() => expect(api.getStaffTickets).toHaveBeenCalledWith(expect.objectContaining({ statusGroup: 'active', owner: 'me' })));
    expect(window.location.search).toBe('?statusGroup=active&owner=me');
  });
  it('keeps date filters through pagination and clears all filters', async () => {
    const navigate = vi.fn(); vi.mocked(api.getStaffTickets).mockResolvedValue({ tickets: [{ id: 1, ticketNumber: 'T1', summary: 'One' } as any], pagination: { page: 1, pageSize: 10, totalCount: 20 } });
    render(<StaffTicketQueue query="updatedFrom=2026-10-13T17%3A00%3A00Z&sort=-updatedAt" onNavigate={navigate} />);
    await screen.findAllByText('One'); fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(navigate).toHaveBeenLastCalledWith('/queue?updatedFrom=2026-10-13T17%3A00%3A00Z&sort=-updatedAt&page=2');
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' })); expect(navigate).toHaveBeenLastCalledWith('/queue');
  });
});

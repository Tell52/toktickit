import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequesterDashboard from '../../src/components/RequesterDashboard';
import MyTickets from '../../src/MyTickets';
import App from '../../src/App';
import * as api from '../../src/api';
import { AuthContext } from '../../src/context/AuthContext';

vi.mock('../../src/api');
const user = { id: 'r1', name: 'Requester One', email: 'r1@example.com', role: 'REQUESTER', mustChangePassword: false };
const checkAuth = vi.fn().mockResolvedValue(undefined), invalidateSession = vi.fn();
const data: api.RequesterDashboardData = { asOf: '2026-10-20T10:00:00.000Z', timeZone: 'Asia/Bangkok', window: { since: '2026-10-13T17:00:00.000Z', before: '2026-10-20T10:00:00.000Z' }, metrics: { openTickets: 4, waitingForRequester: 1, recentlyUpdated: 6, recentlyResolved: 2 }, attentionTickets: [{ id: 4, ticketNumber: 'T4', summary: 'Router response needed', currentStatus: 'Waiting for Requester', itPriority: 'High', updatedAt: '2026-10-20T09:00:00Z', resolvedAt: null }], recentTickets: [{ id: 11, ticketNumber: 'T11', summary: 'Router repaired', currentStatus: 'Resolved', itPriority: 'High', updatedAt: '2026-10-20T09:00:00Z', resolvedAt: '2026-10-20T09:00:00Z' }] };
function auth(child: React.ReactNode) { return <AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout: vi.fn(), checkAuth, invalidateSession }}>{child}</AuthContext.Provider>; }
function show() { const navigate = vi.fn(); render(auth(<RequesterDashboard onNavigate={navigate} />)); return navigate; }
beforeEach(() => {
  vi.resetAllMocks(); checkAuth.mockResolvedValue(undefined); window.history.replaceState({}, '', '/');
  vi.mocked(api.getRequesterDashboard).mockResolvedValue(structuredClone(data));
  vi.mocked(api.getMyTickets).mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
});
afterEach(cleanup);
describe('Requester dashboard (UI-07)', () => {
  it('renders authoritative metrics, bounded previews and exact URL predicates', async () => {
    const navigate = show(); await screen.findByText('Your tickets at a glance');
    await screen.findByRole('link', { name: 'Open tickets 4' });
    const cases = [
      ['Open tickets 4', { statusGroup: 'active' }], ['Waiting for you 1', { status: 'Waiting for Requester' }],
      ['Updated in last 7 days 6', { updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' }],
      ['Resolved in last 7 days 2', { statusGroup: 'resolved', resolvedFrom: data.window.since, resolvedBefore: data.window.before, sort: '-resolvedAt' }],
    ] as const;
    for (const [name, expected] of cases) {
      const link = screen.getByRole('link', { name }); const url = new URL(link.getAttribute('href')!, 'http://localhost');
      expect(Object.fromEntries(url.searchParams)).toEqual(expected); fireEvent.click(link); expect(navigate).toHaveBeenLastCalledWith(url.pathname + url.search);
    }
    expect(screen.getByText(/Last 7 days · Asia\/Bangkok/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Waiting for you' })).getByRole('link')).toHaveAttribute('href', '/tickets/4');
    expect(screen.queryByText(/Internal Notes|passwordHash/)).not.toBeInTheDocument();
  });
  it('announces loading without inventing zero counts and prevents duplicate refresh clicks', async () => {
    let resolve!: (value: api.RequesterDashboardData) => void;
    vi.mocked(api.getRequesterDashboard).mockReturnValue(new Promise(r => { resolve = r; })); show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard'); expect(screen.getByRole('button', { name: 'Refresh dashboard' })).toBeDisabled(); expect(screen.queryByRole('link', { name: /Open tickets/ })).not.toBeInTheDocument();
    await act(async () => resolve(data)); expect(await screen.findByRole('link', { name: 'Open tickets 4' })).toBeInTheDocument();
  });
  it('renders actual zeros with empty guidance and a working create link', async () => {
    vi.mocked(api.getRequesterDashboard).mockResolvedValue({ ...data, metrics: { openTickets: 0, waitingForRequester: 0, recentlyUpdated: 0, recentlyResolved: 0 }, attentionTickets: [], recentTickets: [] });
    const navigate = show(); await screen.findByText('No tickets need your attention.'); expect(screen.getByRole('link', { name: 'Open tickets 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Create a ticket' })); expect(navigate).toHaveBeenCalledWith('/create-ticket');
  });
  it('uses safe retry after network failure and never displays backend internals', async () => {
    vi.mocked(api.getRequesterDashboard).mockRejectedValueOnce(new Error('PRIVATE_DATABASE passwordHash SELECT secret'));
    show(); expect(await screen.findByRole('alert')).not.toHaveTextContent(/PRIVATE_DATABASE|SELECT|passwordHash/);
    expect(screen.queryByRole('link', { name: /Open tickets/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' })); await screen.findByRole('link', { name: 'Open tickets 4' });
  });
  it.each([401, 403])('clears previously rendered data after HTTP %s and updates authentication', async status => {
    show(); await screen.findByRole('link', { name: 'Open tickets 4' });
    vi.mocked(api.getRequesterDashboard).mockRejectedValueOnce({ status, error: { message: 'PRIVATE_BACKEND_DETAIL' } }); fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await screen.findByRole('alert'); expect(screen.queryByRole('link', { name: 'Open tickets 4' })).not.toBeInTheDocument(); expect(screen.queryByText('PRIVATE_BACKEND_DETAIL')).not.toBeInTheDocument();
    expect(status === 401 ? invalidateSession : checkAuth).toHaveBeenCalledOnce(); expect(screen.queryByRole('button', { name: 'Retry dashboard' })).not.toBeInTheDocument();
  });
  it('labels retained data as old after a failed background refresh', async () => {
    show(); await screen.findByRole('link', { name: 'Open tickets 4' }); vi.mocked(api.getRequesterDashboard).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' })); await screen.findByText(/Showing the last successful update/); expect(screen.getByRole('link', { name: 'Open tickets 4' })).toBeInTheDocument();
  });
  it('refetches on returning focus and ignores a superseded response', async () => {
    let old!: (value: api.RequesterDashboardData) => void;
    vi.mocked(api.getRequesterDashboard).mockReturnValueOnce(new Promise(r => { old = r; })).mockResolvedValueOnce({ ...data, metrics: { ...data.metrics, openTickets: 9 } });
    show(); fireEvent(window, new Event('focus')); await screen.findByRole('link', { name: 'Open tickets 9' }); await act(async () => old(data)); expect(screen.queryByRole('link', { name: 'Open tickets 4' })).not.toBeInTheDocument();
  });
});
describe('Requester dashboard navigation and filtered My Tickets', () => {
  it('uses a not-found view for unknown routes', () => {
    window.history.replaceState({}, '', '/unknown'); render(auth(<App />)); expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
  it('lands on Dashboard, keeps real links and parses query filters on popstate', async () => {
    render(auth(<App />)); await screen.findByRole('link', { name: 'Open tickets 4' }); expect(location.pathname).toBe('/dashboard'); expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Open tickets 4' })); await waitFor(() => expect(api.getMyTickets).toHaveBeenCalledWith(user.id, { statusGroup: 'active' }));
    expect(screen.getByLabelText('Applied ticket filters')).toHaveTextContent('Status group: active');
    act(() => { window.history.pushState({}, '', '/tickets?status=Waiting%20for%20Requester'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(api.getMyTickets).toHaveBeenLastCalledWith(user.id, { status: 'Waiting for Requester' })); expect(screen.getByLabelText('Ticket status')).toHaveValue('Waiting for Requester');
  });
  it('preserves time-window chips and filters through pagination and clear', async () => {
    vi.mocked(api.getMyTickets).mockResolvedValue({ data: [{ ...data.recentTickets[0], category: { name: 'Hardware' }, createdAt: data.asOf }], meta: { total: 20, totalPages: 2 } });
    const navigate = vi.fn(); const query = new URLSearchParams({ updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' }).toString();
    render(<MyTickets requesterId={user.id} query={query} onNavigate={navigate} />); await screen.findByRole('button', { name: 'Next' });
    expect(screen.getByLabelText('Applied ticket filters')).toHaveTextContent(data.window.since);
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); expect(new URL(navigate.mock.calls[0][0], 'http://localhost').searchParams.get('updatedBefore')).toBe(data.window.before);
    expect(new URL(navigate.mock.calls[0][0], 'http://localhost').searchParams.get('page')).toBe('2'); fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' })); expect(navigate).toHaveBeenLastCalledWith('/tickets');
  });
  it('ignores old list results after changing the Requester identity', async () => {
    let old!: (value: any) => void;
    vi.mocked(api.getMyTickets).mockReturnValueOnce(new Promise(r => { old = r; }));
    const view = render(<MyTickets requesterId="r1" />); await waitFor(() => expect(api.getMyTickets).toHaveBeenCalledOnce());
    view.rerender(<MyTickets requesterId="r2" />); await screen.findByText("You haven't created any tickets yet.");
    await act(async () => old({ data: [{ ...data.recentTickets[0], summary: 'Other private ticket', category: { name: 'Hardware' }, createdAt: data.asOf }], meta: { totalPages: 1 } })); expect(screen.queryByText('Other private ticket')).not.toBeInTheDocument();
  });
});

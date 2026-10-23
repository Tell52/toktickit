import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../src/App';
import { AuthContext } from '../../src/context/AuthContext';
import * as api from '../../src/api';
vi.mock('../../src/api');

const base = { asOf: '2026-10-23T06:00:00Z', timeZone: 'Asia/Bangkok', window: { since: '2026-10-16T17:00:00Z', before: '2026-10-23T06:00:00Z' } };
const logout = vi.fn();
function show(role = 'REQUESTER') {
  const user = { id: 'reviewer', name: 'Review User', email: 'review@example.com', role, mustChangePassword: false };
  return render(<AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout, checkAuth: vi.fn() }}><App /></AuthContext.Provider>);
}
beforeEach(() => {
  vi.clearAllMocks(); logout.mockResolvedValue(undefined); window.history.replaceState({}, '', '/dashboard');
  vi.mocked(api.getRequesterDashboard).mockResolvedValue({ ...base, metrics: { openTickets: 0, waitingForRequester: 0, recentlyUpdated: 0, recentlyResolved: 0 }, attentionTickets: [], recentTickets: [] });
  vi.mocked(api.getStaffDashboard).mockResolvedValue({ ...base, metrics: { unassignedTickets: 0, myTickets: 0, recentlyUpdated: 0, myActiveActions: 0, byStatus: { New: 0 }, byPriority: { High: 0 } }, urgentTickets: [], recentTickets: [], myActions: { actions: [], pagination: { page: 1, pageSize: 5, totalCount: 0 } } });
  vi.mocked(api.getCategories).mockResolvedValue([]); vi.mocked(api.getRelatedSystems).mockResolvedValue([]);
});
describe('Sprint 4 shell accessibility', () => {
  it.each(['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'])('%s has named landmarks, skip navigation and role-appropriate current page', async role => {
    show(role); const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: role === 'REQUESTER' ? 'My Tickets' : 'My Queue' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Admin' }) !== null).toBe(role === 'ADMINISTRATOR');
    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' })); expect(screen.getByRole('main')).toHaveFocus();
    await screen.findByRole('button', { name: 'Refresh dashboard' });
  });
  it('moves focus and updates the title after navigation; Create Ticket contains no placeholder upload', async () => {
    show(); fireEvent.click(screen.getByRole('link', { name: 'Create Ticket' }));
    // Route focus must be settled before the user can start filling a field.
    expect(screen.getByRole('main')).toHaveFocus();
    const summary = screen.getByLabelText('Summary *');
    summary.focus(); fireEvent.change(summary, { target: { value: 'Immediate input' } });
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
    expect(summary).toHaveFocus(); expect(summary).toHaveValue('Immediate input');
    fireEvent.change(summary, { target: { value: '' } });
    expect(document.title).toBe('Create Ticket · TokTickIT');
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Ticket' }));
    await waitFor(() => expect(screen.getByLabelText('Summary *')).toHaveFocus());
    expect(screen.getByLabelText('Summary *')).toHaveAttribute('aria-describedby', 'summary-error');
  });
  it('connects profile and password inputs to visible labels', async () => {
    window.history.replaceState({}, '', '/profile'); show();
    expect(screen.getByLabelText('Full Name')).toHaveValue('Review User');
    expect(screen.getByLabelText('Email Address')).toHaveValue('review@example.com');
    expect(screen.getByLabelText('New password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  });
  it('keeps the shell recoverable when sign-out fails without an unhandled error', async () => {
    logout.mockRejectedValueOnce(new Error('PRIVATE_SERVER_DETAIL')); show();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
    expect(screen.queryByText('PRIVATE_SERVER_DETAIL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' })); await waitFor(() => expect(logout).toHaveBeenCalledTimes(2));
  });
});

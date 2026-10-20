import { StrictMode, useState } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TicketWorkflow from '../../src/components/TicketWorkflow';
import TicketStatusHistory from '../../src/components/TicketStatusHistory';
import StaffTicketDetail from '../../src/components/StaffTicketDetail';
import RequesterTicketDetail from '../../src/RequesterTicketDetail';
import * as api from '../../src/api';
import * as actions from '../../src/actions-api';
vi.mock('../../src/api');
vi.mock('../../src/actions-api', async original => ({ ...await original<typeof actions>(), getActions: vi.fn() }));

const staff = { id: 's1', name: 'Mali Staff', email: 'staff@test.com', role: 'IT_STAFF' };
const ticket: api.StaffTicketDetailData = {
  id: 1, version: 3, resolutionCycle: 1, ticketNumber: 'TKT-UI-1', summary: 'Network unavailable', description: 'Investigate the router',
  category: 'Network', relatedSystem: 'Router', requestedPriority: 'High', itPriority: 'HIGH', status: 'In Progress', currentStatus: 'In Progress',
  owner: { id: staff.id, name: staff.name }, requester: { id: 'r1', name: 'Requester One' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  resolutionGate: { eligible: true, completedCount: 1, unfinishedCount: 0, followUpCount: 0, blockers: [] },
  notes: [{ id: 'n1', authorId: staff.id, authorName: staff.name, content: 'PRIVATE_SENTINEL', createdAt: '2026-10-01T00:00:00Z' }], comments: [], attachments: [],
};
const history = { events: [], pagination: { page: 1, pageSize: 20, totalCount: 0 } };
// Independent contract expectations from ui-spec.md, rather than the renderer's map.
const transitions: [string, string[]][] = [
  ['New', ['Open', 'In Progress', 'Cancelled']],
  ['Open', ['In Progress', 'Waiting for Requester', 'Cancelled']],
  ['In Progress', ['Waiting for Requester', 'Resolved', 'Cancelled']],
  ['Waiting for Requester', ['In Progress', 'Resolved', 'Cancelled']],
  ['Resolved', ['Closed', 'Reopened']], ['Closed', ['Reopened']],
  ['Reopened', ['In Progress', 'Waiting for Requester', 'Cancelled']], ['Cancelled', []],
];
const deny = vi.fn();
const refresh = vi.fn<() => Promise<api.StaffTicketDetailData>>();
function Harness({ initial = ticket, role = 'IT_STAFF' }: { initial?: api.StaffTicketDetailData; role?: string }) {
  const [current, setCurrent] = useState(initial);
  return <TicketWorkflow ticketId={1} ticket={current} staffUsers={[staff]} currentUser={{ role }} onAccessError={deny}
    refreshTicket={async () => { const fresh = await refresh(); setCurrent(fresh); return fresh; }} />;
}
const changeStatus = (value: string) => fireEvent.change(screen.getByLabelText('Current Status'), { target: { value } });
const cancelledReason = () => screen.getByLabelText('Ticket cancellation reason *');
const cancel = () => { changeStatus('Cancelled'); fireEvent.change(cancelledReason(), { target: { value: 'Duplicate request' } }); };
const confirmCancel = () => fireEvent.click(screen.getByRole('button', { name: 'Confirm ticket cancellation' }));
const failure = (status: number, code: string) => ({ status, error: { code, message: 'INTERNAL_SQL_SECRET should never be displayed' } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getStaffTicketDetail).mockResolvedValue(ticket);
  vi.mocked(api.getStaffUsers).mockResolvedValue({ users: [staff] });
  vi.mocked(api.getTicketStatusHistory).mockResolvedValue(history);
  vi.mocked(actions.getActions).mockResolvedValue({ actions: [], pagination: history.pagination, ticketVersion: 3, resolutionCycle: 1 });
  vi.mocked(api.updateStaffTicketStatus).mockResolvedValue({});
  vi.mocked(api.updateStaffTicketOwner).mockResolvedValue({});
  vi.mocked(api.updateStaffTicketPriority).mockResolvedValue({});
  refresh.mockResolvedValue({ ...ticket, version: 4 });
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe('UI-05: allowed transitions and resolution requirements', () => {
  it.each(transitions)('shows only the allowed transitions from %s', (status, targets) => {
    render(<Harness initial={{ ...ticket, status, currentStatus: status }} />);
    const select = screen.getByLabelText('Current Status') as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.value)).toEqual([status, ...targets]);
    if (!targets.length) expect(select).toBeDisabled();
  });
  it.each(['REQUESTER', 'UNKNOWN'])('does not expose operational controls to %s', role => {
    render(<Harness role={role} />); expect(screen.queryByTestId('operational-controls')).not.toBeInTheDocument();
  });
  it('supports Administrator controls and uses the authoritative transition subset', () => {
    render(<Harness role="ADMINISTRATOR" initial={{ ...ticket, allowedTransitions: ['Cancelled'] }} />);
    expect(within(screen.getByLabelText('Current Status')).getAllByRole('option')).toHaveLength(2);
  });
  it('disables Resolve and explains every blocker with a link to Actions Taken', () => {
    render(<Harness initial={{ ...ticket, resolutionGate: { eligible: false, completedCount: 0, unfinishedCount: 2, followUpCount: 1, blockers: ['NO_COMPLETED_ACTION', 'UNFINISHED_ACTIONS', 'FOLLOW_UP_REQUIRED'] } }} />);
    expect(screen.getByRole('option', { name: /Move to Resolved/ })).toBeDisabled();
    expect(screen.getByText('0 completed · 2 unfinished · 1 requiring follow-up')).toBeInTheDocument();
    expect(screen.getByText(/Complete at least one action/)).toBeInTheDocument();
    expect(screen.getByText(/Complete or cancel all unfinished/)).toBeInTheDocument();
    expect(screen.getByText(/Clear required follow-up/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Actions Taken' })).toHaveAttribute('href', '#actions-taken');
  });
  it('saves a permitted transition with the observed version and refreshes once', async () => {
    render(<Harness />); changeStatus('Resolved');
    await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(1, 'Resolved', 3));
    expect(await screen.findByText('Status changed to Resolved')).toBeInTheDocument(); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('requires a cancellation reason and sends its trimmed value', async () => {
    render(<Harness />); changeStatus('Cancelled'); expect(api.updateStaffTicketStatus).not.toHaveBeenCalled(); confirmCancel();
    expect(cancelledReason()).toHaveFocus(); expect(screen.getByText(/Enter a cancellation reason/)).toBeInTheDocument();
    fireEvent.change(cancelledReason(), { target: { value: ' '.repeat(2) + 'Duplicate request  ' } }); confirmCancel();
    await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(1, 'Cancelled', 3, 'Duplicate request'));
  });
  it('validates cancellation reason length before requesting', () => {
    render(<Harness />); cancel(); fireEvent.change(cancelledReason(), { target: { value: 'x'.repeat(1001) } }); confirmCancel(); expect(api.updateStaffTicketStatus).not.toHaveBeenCalled();
  });
  it('requires explicit reopening confirmation and explains the new cycle', async () => {
    render(<Harness initial={{ ...ticket, status: 'Closed', currentStatus: 'Closed' }} />); changeStatus('Reopened');
    expect(screen.getByText(/Reopening starts a new resolution cycle/)).toBeInTheDocument(); expect(api.updateStaffTicketStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ticket reopening' })); await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(1, 'Reopened', 3));
  });
});

describe('UI-06: conflict recovery, safe feedback and retained input', () => {
  it('retains the reason on stale conflict, loads current state and retries only explicitly', async () => {
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(failure(409, 'STALE_VERSION')).mockResolvedValue({});
    refresh.mockResolvedValue({ ...ticket, version: 9, itPriority: 'LOW' }); render(<Harness />); cancel(); confirmCancel();
    fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' }));
    await screen.findByText('Latest saved ticket — your input is retained');
    expect(cancelledReason()).toHaveValue('Duplicate request'); expect(api.updateStaffTicketStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/IT Priority: LOW/)).toBeInTheDocument(); confirmCancel();
    await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenLastCalledWith(1, 'Cancelled', 9, 'Duplicate request'));
  });
  it.each(['INVALID_TRANSITION', 'RESOLUTION_BLOCKED', 'RETRYABLE_CONFLICT'])('handles %s without discarding the pending selection', async code => {
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(failure(409, code)); render(<Harness />); changeStatus('Resolved');
    await screen.findByRole('button', { name: 'Load latest ticket' });
    expect(screen.getByRole('button', { name: 'Retry ticket change' })).toBeDisabled(); expect(screen.queryByText(/INTERNAL_SQL_SECRET/)).not.toBeInTheDocument();
  });
  it('prevents retry when another user changed the ticket to a terminal state', async () => {
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(failure(409, 'STALE_VERSION'));
    refresh.mockResolvedValue({ ...ticket, version: 9, status: 'Cancelled', currentStatus: 'Cancelled', allowedTransitions: [] });
    render(<Harness />); changeStatus('Resolved'); fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' }));
    await screen.findByText(/Your requested status is no longer available/); expect(screen.getByRole('button', { name: 'Retry ticket change' })).toBeDisabled(); expect(api.updateStaffTicketStatus).toHaveBeenCalledTimes(1);
  });
  it.each([failure(500, 'INTERNAL_ERROR'), new TypeError('Network lost')])('retains input on an unconfirmed failure and recovers from a failed refresh', async err => {
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(err); refresh.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValue({ ...ticket, version: 7 });
    render(<Harness />); cancel(); confirmCancel(); fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1)); expect(cancelledReason()).toHaveValue('Duplicate request');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load latest ticket' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Load latest ticket' })); await screen.findByText('Latest saved ticket — your input is retained');
    confirmCancel(); await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenLastCalledWith(1, 'Cancelled', 7, 'Duplicate request'));
  });
  it('does not repeat a successful write when only the subsequent refresh failed', async () => {
    refresh.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValue({ ...ticket, version: 4 }); render(<Harness />); changeStatus('Resolved');
    fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' })); await screen.findByText('Ticket refreshed successfully.');
    expect(api.updateStaffTicketStatus).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: 'Retry ticket change' })).not.toBeInTheDocument();
  });
  it.each([['Ticket Owner', 'unassigned', 'owner'], ['IT Priority', 'LOW', 'priority']])('retains a failed %s selection and uses the latest version on retry', async (label, value, kind) => {
    const mutation = kind === 'owner' ? api.updateStaffTicketOwner : api.updateStaffTicketPriority;
    vi.mocked(mutation).mockRejectedValueOnce(failure(409, 'STALE_VERSION')).mockResolvedValue({}); refresh.mockResolvedValue({ ...ticket, version: 8 });
    render(<Harness />); fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' })); await screen.findByText('Latest saved ticket — your input is retained');
    expect(screen.getByLabelText(label)).toHaveValue(value); fireEvent.click(screen.getByRole('button', { name: 'Retry ticket change' }));
    await waitFor(() => expect(mutation).toHaveBeenLastCalledWith(1, kind === 'owner' ? null : 'LOW', 8));
  });
  it('blocks rapid duplicate requests and all other ticket controls while saving', async () => {
    let resolve!: (value: unknown) => void; vi.mocked(api.updateStaffTicketStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<Harness />); cancel(); confirmCancel(); fireEvent.click(screen.getByRole('button', { name: 'Saving ticket…' }));
    expect(screen.getByLabelText('Ticket Owner')).toBeDisabled(); expect(screen.getByLabelText('IT Priority')).toBeDisabled(); expect(api.updateStaffTicketStatus).toHaveBeenCalledTimes(1);
    await act(async () => resolve({}));
  });
  it('confirms dirty navigation and Escape dismissal, retains declined input, and returns focus', async () => {
    const user = userEvent.setup(); render(<Harness />); screen.getByLabelText('Current Status').focus(); changeStatus('Cancelled');
    expect(cancelledReason()).toHaveFocus(); fireEvent.change(cancelledReason(), { target: { value: 'Keep this draft' } });
    expect(window.dispatchEvent(new Event('toktickit:before-navigate', { cancelable: true }))).toBe(false);
    await user.keyboard('{Escape}'); expect(cancelledReason()).toHaveValue('Keep this draft');
    vi.mocked(window.confirm).mockReturnValue(true); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveFocus());
  });
  it('keeps initial confirmation focus during the Strict Mode effect rehearsal', async () => {
    render(<StrictMode><Harness /></StrictMode>); changeStatus('Cancelled');
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(cancelledReason()).toHaveFocus();
  });
  it('contains Tab focus in the confirmation and ignores Escape during submission', async () => {
    const user = userEvent.setup(); let resolve!: (value: unknown) => void;
    vi.mocked(api.updateStaffTicketStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<Harness />); cancel(); await user.tab({ shift: true }); expect(screen.getByRole('button', { name: 'Confirm ticket cancellation' })).toHaveFocus();
    await user.tab(); expect(cancelledReason()).toHaveFocus(); confirmCancel(); await user.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => resolve({}));
  });
  it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [403, 'PASSWORD_CHANGE_REQUIRED'], [404, 'NOT_FOUND']] as const)('clears private detail and drafts on %s %s', async (status, code) => {
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(failure(status, code)); render(<StaffTicketDetail ticketId={1} currentUser={staff} />);
    await screen.findByLabelText('Current Status'); fireEvent.click(screen.getByTestId('tab-internal-notes')); expect(screen.getByText('PRIVATE_SENTINEL')).toBeInTheDocument();
    cancel(); confirmCancel(); await waitFor(() => expect(screen.queryByTestId('operational-controls')).not.toBeInTheDocument());
    expect(screen.queryByText('PRIVATE_SENTINEL')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Ticket cancellation reason *')).not.toBeInTheDocument(); expect(screen.queryByText(/INTERNAL_SQL_SECRET/)).not.toBeInTheDocument();
  });
  it('refreshes the summary, gate, Actions and status history after a successful transition', async () => {
    render(<StaffTicketDetail ticketId={1} currentUser={staff} />); await screen.findByLabelText('Current Status');
    vi.mocked(api.getStaffTicketDetail).mockResolvedValue({ ...ticket, version: 4, status: 'Resolved', currentStatus: 'Resolved', resolvedAt: '2026-10-01T00:00:00Z' });
    vi.mocked(api.getTicketStatusHistory).mockResolvedValue({ ...history, events: [{ id: 'e1', fromStatus: 'In Progress', toStatus: 'Resolved', reason: null, resolutionCycle: 1, createdAt: ticket.updatedAt, actor: staff }] });
    changeStatus('Resolved'); await screen.findByText('In Progress → Resolved');
    expect(screen.getByLabelText('Current Status')).toHaveValue('Resolved'); expect(actions.getActions).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Actions are read-only. Reopen the Ticket before recording new work.')).toBeInTheDocument();
  });
  it('keeps ticket controls disabled until an Action write and its parent refresh finish', async () => {
    let finishRefresh!: (value: api.StaffTicketDetailData) => void;
    const create = vi.spyOn(actions, 'createAction').mockResolvedValue({ action: {} as actions.ActionTaken, ticketVersion: 4 });
    render(<StaffTicketDetail ticketId={1} currentUser={staff} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add action' }));
    fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Router inspection' } });
    vi.mocked(api.getStaffTicketDetail).mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByLabelText('Current Status')).toBeDisabled();
    await waitFor(() => expect(api.getStaffTicketDetail).toHaveBeenCalledTimes(2));
    await act(async () => finishRefresh({ ...ticket, version: 4 }));
    await waitFor(() => expect(screen.getByLabelText('Current Status')).toBeEnabled());
    changeStatus('Resolved'); await waitFor(() => expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(1, 'Resolved', 4));
  });
  it('waits for active assignees before enabling action creation', async () => {
    let finishUsers!: (value: { users: api.StaffUserItem[] }) => void;
    vi.mocked(api.getStaffUsers).mockImplementation(() => new Promise(resolve => { finishUsers = resolve; }));
    render(<StaffTicketDetail ticketId={1} currentUser={staff} />);
    expect(await screen.findByRole('button', { name: 'Add action' })).toBeDisabled();
    await act(async () => finishUsers({ users: [staff] }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add action' })).toBeEnabled());
  });
});

describe('Shared status history and Requester advisory', () => {
  it('paginates status history and recovers from a failed page request', async () => {
    vi.mocked(api.getTicketStatusHistory).mockResolvedValue({ events: [{ id: 'e1', fromStatus: 'New', toStatus: 'Cancelled', reason: 'Duplicate', actor: staff, resolutionCycle: 1, createdAt: ticket.updatedAt }], pagination: { page: 1, pageSize: 20, totalCount: 21 } });
    render(<TicketStatusHistory ticketId={1} />); await screen.findByText('Reason: Duplicate');
    vi.mocked(api.getTicketStatusHistory).mockRejectedValueOnce(new TypeError('Network lost'));
    fireEvent.click(screen.getByRole('button', { name: 'Next status changes' })); await screen.findByText('Status history could not be loaded. Please retry.');
    fireEvent.click(screen.getByRole('button', { name: 'Next status changes' })); await screen.findByText('Page 2 of 2'); expect(api.getTicketStatusHistory).toHaveBeenLastCalledWith(1, 2);
  });
  it('clears previous history when its refresh reports a denied ticket', async () => {
    vi.mocked(api.getTicketStatusHistory).mockResolvedValue({ ...history, events: [{ id: 'e1', fromStatus: 'New', toStatus: 'Cancelled', reason: 'Duplicate', actor: staff, resolutionCycle: 1, createdAt: ticket.updatedAt }] });
    render(<TicketStatusHistory ticketId={1} onAccessError={deny} />); await screen.findByText('Reason: Duplicate');
    vi.mocked(api.getTicketStatusHistory).mockRejectedValueOnce(failure(404, 'NOT_FOUND')); fireEvent.click(screen.getByRole('button', { name: 'Refresh status history' }));
    await screen.findByText('Ticket not found.'); expect(screen.queryByText('Reason: Duplicate')).not.toBeInTheDocument(); expect(deny).toHaveBeenCalled();
  });
  it('refreshes an advisory response without changing formal status or exposing staff controls', async () => {
    const requesterTicket = { ...ticket, category: { name: 'Network' }, relatedSystem: { name: 'Router' } };
    vi.mocked(api.getTicketDetail).mockResolvedValueOnce(requesterTicket).mockResolvedValue({ ...requesterTicket, version: 4, problemAppearsResolved: true, indicatedAt: ticket.updatedAt });
    vi.mocked(api.indicateResolved).mockResolvedValue({ version: 4, indicatedAt: ticket.updatedAt });
    render(<RequesterTicketDetail ticketId="1" />); fireEvent.click(await screen.findByRole('button', { name: /Problem Appears Resolved/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/You indicated this problem appears resolved on/);
    expect(api.getTicketDetail).toHaveBeenCalledTimes(2); expect(api.updateStaffTicketStatus).not.toHaveBeenCalled(); expect(screen.queryByTestId('operational-controls')).not.toBeInTheDocument(); expect(screen.queryByText('PRIVATE_SENTINEL')).not.toBeInTheDocument();
  });
  it('recovers a stale advisory and removes the confirmation if the status became Closed', async () => {
    const requesterTicket = { ...ticket, category: { name: 'Network' }, relatedSystem: { name: 'Router' } };
    vi.mocked(api.getTicketDetail).mockResolvedValueOnce(requesterTicket).mockResolvedValue({ ...requesterTicket, currentStatus: 'Closed', version: 9 });
    vi.mocked(api.indicateResolved).mockRejectedValueOnce(failure(409, 'INVALID_TRANSITION')); render(<RequesterTicketDetail ticketId="1" />);
    fireEvent.click(await screen.findByRole('button', { name: /Problem Appears Resolved/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load latest ticket' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.indicateResolved).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: /Problem Appears Resolved/ })).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ActionsTaken from '../../src/components/ActionsTaken';
import * as api from '../../src/actions-api';
import * as legacy from '../../src/api';
import { AuthContext } from '../../src/context/AuthContext';
import { allowNavigation } from '../../src/navigation-guard';

vi.mock('../../src/actions-api', async original => ({ ...await original<typeof api>(), getActions: vi.fn(), createAction: vi.fn(), updateAction: vi.fn(), getActionRevisions: vi.fn() }));
vi.mock('../../src/api', () => ({ getStaffUsers: vi.fn() }));
const user = { id: 'staff-1', name: 'Mali Staff', role: 'IT_STAFF', email: 'staff@example.com', mustChangePassword: false };
const action: api.ActionTaken = { id: 'action-1', ticketId: 3, ticketNumber: 'TKT-0003', resolutionCycle: 1, actionAt: '2026-10-01T08:00:00.123Z', description: 'Inspect router', result: null, performedBy: { id: 'staff-2', name: 'Somchai Staff' }, assignee: { id: user.id, name: user.name, isActive: true }, status: 'PLANNED', followUpRequired: false, followUpNote: null, attachmentNotes: 'Existing network log', cancellationReason: null, version: 2, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' };
const response = (actions = [action], version = 3): api.ActionsResponse => ({ actions, pagination: { page: 1, pageSize: 20, totalCount: actions.length }, ticketVersion: version, resolutionCycle: 1 });
function show(props: Partial<React.ComponentProps<typeof ActionsTaken>> = {}) { return render(<ActionsTaken ticketId={3} ticketStatus="In Progress" ticketCreatedAt="2026-09-01T00:00:00Z" currentUser={user} {...props} />); }
async function view() { fireEvent.click(await screen.findByRole('button', { name: /View action:/ })); }
async function create() { fireEvent.click(await screen.findByRole('button', { name: 'Add action' })); await screen.findByRole('form', { name: 'create action' }); }
function describeDraft(value = 'Check connection') { fireEvent.change(screen.getByLabelText('Description *'), { target: { value } }); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getActions).mockResolvedValue(response());
  vi.mocked(legacy.getStaffUsers).mockResolvedValue({ users: [{ ...user }, { ...user, id: 'staff-2', name: 'Somchai Staff' }] });
  vi.mocked(api.createAction).mockResolvedValue({ action, ticketVersion: 4 });
  vi.mocked(api.updateAction).mockResolvedValue({ action, ticketVersion: 4 });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Actions Taken role and lifecycle permissions (UI-02)', () => {
  it('keeps focus on View action when no form is being dismissed', async () => {
    show();
    const trigger = await screen.findByRole('button', { name: /View action:/ });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Action details' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('shows every Requester action read-only, including cancelled and earlier cycles', async () => {
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, status: 'CANCELLED', resolutionCycle: 0, cancellationReason: 'Duplicate task' }]));
    show({ readOnly: true }); await view();
    expect(screen.getByText('Previous resolution cycle — read-only')).toBeInTheDocument();
    expect(screen.getByText('Duplicate task')).toBeInTheDocument();
    for (const name of ['Add action', 'Edit action', 'Start action', 'Complete action', 'Cancel action', 'Change history']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(legacy.getStaffUsers).not.toHaveBeenCalled();
    expect(api.getActionRevisions).not.toHaveBeenCalled();
    expect(screen.queryByText(/Internal Note/)).not.toBeInTheDocument();
  });
  it.each(['REQUESTER', 'UNKNOWN'])('hides writes for role %s even without the readOnly prop', async role => {
    show({ currentUser: { ...user, role } }); await view(); expect(screen.queryByRole('button', { name: 'Edit action' })).not.toBeInTheDocument();
  });
  it('allows Administrator work independently of performer', async () => {
    show({ currentUser: { ...user, role: 'ADMINISTRATOR' } }); await view(); fireEvent.click(screen.getByRole('button', { name: 'Edit action' }));
    expect(screen.getByText('Somchai Staff', { selector: 'strong' })).toBeInTheDocument(); expect(screen.queryByLabelText('Performed by')).not.toBeInTheDocument();
  });
  it.each(['Resolved', 'Closed', 'Cancelled'])('keeps %s parents read-only', async ticketStatus => {
    show({ ticketStatus }); await view(); expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Edit action' })).not.toBeInTheDocument();
  });
  it.each([{ status: 'CANCELLED' as const, resolutionCycle: 1 }, { status: 'PLANNED' as const, resolutionCycle: 0 }])('keeps cancelled and previous-cycle records immutable (%j)', async changes => {
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, ...changes }])); show(); await view(); expect(screen.queryByRole('button', { name: 'Edit action' })).not.toBeInTheDocument();
  });
  it('permits completed content corrections while fixing status and historical assignee', async () => {
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, status: 'COMPLETED', result: 'Fixed', assignee: { ...action.assignee, isActive: false } }]));
    show(); await view(); expect(screen.queryByRole('button', { name: 'Complete action' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit action' })); expect(screen.getByLabelText('Assigned to *')).toBeDisabled();
    describeDraft('Corrected report'); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await waitFor(() => expect(api.updateAction).toHaveBeenCalled()); const body = vi.mocked(api.updateAction).mock.calls[0][2]; expect(body).not.toHaveProperty('assigneeId'); expect(body).not.toHaveProperty('status'); expect(body.actionAt).toBe(action.actionAt);
  });
});

describe('Actions form, validation and authoritative refresh (UI-01)', () => {
  it('creates Planned with authenticated defaults and refreshes both actions and Ticket', async () => {
    const refreshTicket = vi.fn().mockResolvedValue(undefined); show({ refreshTicket }); await create();
    expect(screen.getByLabelText('Assigned to *')).toHaveValue(user.id); expect(screen.getByText('Mali Staff', { selector: 'strong' })).toBeInTheDocument();
    describeDraft('  Check connection  '); fireEvent.click(screen.getByLabelText(/Follow-up required:/));
    fireEvent.change(screen.getByLabelText('Follow-up note *'), { target: { value: 'Verify tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByText('Action saved successfully.'); expect(api.getActions).toHaveBeenCalledTimes(2); expect(refreshTicket).toHaveBeenCalledOnce();
    const [, body, key] = vi.mocked(api.createAction).mock.calls[0]; expect(body).toMatchObject({ expectedTicketVersion: 3, description: 'Check connection', assigneeId: user.id, followUpRequired: true, followUpNote: 'Verify tomorrow' });
    expect(body.actionAt).toMatch(/Z$/); expect(key).toMatch(/^[\da-f-]{36}$/); expect(body).not.toHaveProperty('performedById'); expect(body).not.toHaveProperty('status');
  });
  it('places required errors beside fields and focuses the first invalid control', async () => {
    show(); await create(); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    expect(await screen.findByText('Enter a description (1–2000 characters).')).toBeInTheDocument(); await waitFor(() => expect(screen.getByLabelText('Description *')).toHaveFocus()); expect(api.createAction).not.toHaveBeenCalled();
  });
  it.each(['2020-01-01T00:00:00', '2099-01-01T00:00:00'])('rejects action time outside Ticket creation..now (%s)', async value => {
    show(); await create(); describeDraft(); fireEvent.change(screen.getByLabelText('Action time (Asia/Bangkok) *'), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Save action' })); expect(api.createAction).not.toHaveBeenCalled(); expect(screen.getByLabelText('Action time (Asia/Bangkok) *')).toHaveAttribute('aria-invalid', 'true');
  });
  it('conditionally requires follow-up note and clears it when follow-up is turned off', async () => {
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, followUpRequired: true, followUpNote: 'Old follow-up' }])); show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Edit action' }));
    fireEvent.change(screen.getByLabelText('Follow-up note *'), { target: { value: '' } }); fireEvent.click(screen.getByRole('button', { name: 'Save action' })); expect(screen.getByText('Enter a follow-up note (1–1000 characters).')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Follow-up required:/)); expect(screen.queryByLabelText('Follow-up note *')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await waitFor(() => expect(api.updateAction).toHaveBeenCalled()); expect(vi.mocked(api.updateAction).mock.calls[0][2]).toMatchObject({ followUpRequired: false, followUpNote: null });
  });
  it('starts Planned with both expected versions', async () => { show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Start action' })); await waitFor(() => expect(api.updateAction).toHaveBeenCalledWith(3, action.id, { expectedTicketVersion: 3, expectedVersion: 2, status: 'IN_PROGRESS' })); });
  it('requires completion result and submits it with follow-up in one explicit operation', async () => {
    show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Complete action' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' })); expect(api.updateAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Result *'), { target: { value: 'Connection restored' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    await waitFor(() => expect(api.updateAction).toHaveBeenCalled()); expect(vi.mocked(api.updateAction).mock.calls[0][2]).toMatchObject({ status: 'COMPLETED', result: 'Connection restored', followUpRequired: false });
  });
  it('requires cancellation reason without offering deletion', async () => {
    show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Cancel action' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' })); expect(api.updateAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Cancellation reason *'), { target: { value: 'Duplicate work' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() => expect(api.updateAction).toHaveBeenCalledWith(3, action.id, { expectedTicketVersion: 3, expectedVersion: 2, status: 'CANCELLED', cancellationReason: 'Duplicate work' })); expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
  it('requires reassignment of an inactive unfinished assignee before completion', async () => {
    const inactive = { ...action, assignee: { id: 'inactive', name: 'Former staff', isActive: false } }; vi.mocked(api.getActions).mockResolvedValue(response([inactive])); show(); await view(); expect(screen.getByText(/Reassign this action/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete action' })); fireEvent.change(screen.getByLabelText('Result *'), { target: { value: 'Done' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' })); expect(api.updateAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Assigned to *'), { target: { value: user.id } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' })); await waitFor(() => expect(api.updateAction).toHaveBeenCalled());
  });
  it('loads staff-only paginated revision snapshots and renders text safely', async () => {
    vi.mocked(api.getActionRevisions).mockResolvedValue({ revisions: [{ revision: 1, actor: { id: user.id, name: user.name }, createdAt: action.createdAt, snapshot: { description: '<script>bad()</script>', followUpRequired: false } }], pagination: { page: 1, pageSize: 20, totalCount: 21 } });
    show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Change history' })); await screen.findByText('<script>bad()</script>'); expect(document.querySelector('script')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Next revisions' })); await waitFor(() => expect(api.getActionRevisions).toHaveBeenLastCalledWith(3, action.id, 2));
  });
  it('exposes all ordered actions through bounded paging', async () => {
    vi.mocked(api.getActions).mockResolvedValue({ ...response(), pagination: { page: 1, pageSize: 20, totalCount: 21 } }); show(); fireEvent.click(await screen.findByRole('button', { name: 'Next actions' })); await waitFor(() => expect(api.getActions).toHaveBeenLastCalledWith(3, 2));
  });
});

describe('Safe failures, drafts and replay (UI-03/04/06)', () => {
  it('retains stale draft, loads latest separately and retries only after explicit save', async () => {
    vi.mocked(api.updateAction).mockRejectedValueOnce(new api.ActionsError(409, 'STALE_VERSION')).mockResolvedValue({ action, ticketVersion: 10 });
    show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Edit action' })); describeDraft('My retained draft'); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByRole('button', { name: 'Load latest' }); expect(screen.getByLabelText('Description *')).toHaveValue('My retained draft'); expect(screen.getByRole('button', { name: 'Save action' })).toBeDisabled();
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, description: 'Other staff edit', version: 8 }], 9)); fireEvent.click(screen.getByRole('button', { name: 'Load latest' }));
    await screen.findByText('Latest saved values — your draft is retained below'); expect(screen.getByLabelText('Description *')).toHaveValue('My retained draft'); expect(api.updateAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save action' })); await waitFor(() => expect(api.updateAction).toHaveBeenCalledTimes(2)); expect(vi.mocked(api.updateAction).mock.calls[1][2]).toMatchObject({ expectedTicketVersion: 9, expectedVersion: 8, description: 'My retained draft' });
  });
  it('locks an uncertain create and replays identical payload/key', async () => {
    vi.mocked(api.createAction).mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValue({ action, ticketVersion: 4 }); show(); await create(); describeDraft(); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByRole('button', { name: 'Retry identical submission' }); expect(screen.getByLabelText('Description *')).toBeDisabled(); expect(screen.getByRole('button', { name: 'Discard / Cancel' })).toBeDisabled(); expect(allowNavigation()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry identical submission' })); await screen.findByText('Action saved successfully.'); expect(vi.mocked(api.createAction).mock.calls[1]).toEqual(vi.mocked(api.createAction).mock.calls[0]);
  });
  it('prevents double submission while busy', async () => {
    let resolve!: (value: { action: api.ActionTaken; ticketVersion: number }) => void; vi.mocked(api.createAction).mockReturnValue(new Promise(done => { resolve = done; })); show(); await create(); describeDraft(); const button = screen.getByRole('button', { name: 'Save action' }); fireEvent.click(button); fireEvent.click(button); expect(api.createAction).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled(); await act(async () => resolve({ action, ticketVersion: 4 }));
  });
  it('permits correcting a known validation rejection with a fresh create key', async () => {
    vi.mocked(api.createAction).mockRejectedValueOnce(new api.ActionsError(400, 'VALIDATION_ERROR', ['description'])).mockResolvedValue({ action, ticketVersion: 4 }); show(); await create(); describeDraft(); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByText('Check this value against the field requirements.'); describeDraft('Corrected'); fireEvent.click(screen.getByRole('button', { name: 'Save action' })); await screen.findByText('Action saved successfully.'); expect(vi.mocked(api.createAction).mock.calls[0][2]).not.toBe(vi.mocked(api.createAction).mock.calls[1][2]);
  });
  it('preserves a failed PATCH draft and masks raw server errors', async () => {
    vi.mocked(api.updateAction).mockRejectedValue(new Error('SQL password stack trace')); show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Edit action' })); describeDraft('Draft'); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByRole('button', { name: 'Load latest' }); expect(screen.getByLabelText('Description *')).toHaveValue('Draft'); expect(screen.queryByText(/SQL password/)).not.toBeInTheDocument();
  });
  it('confirms discard, preserves rejected discard and restores focus on Escape', async () => {
    show(); await create(); describeDraft(); vi.mocked(window.confirm).mockReturnValue(false); expect(allowNavigation()).toBe(false); fireEvent.click(screen.getByRole('button', { name: 'Discard / Cancel' })); expect(screen.getByLabelText('Description *')).toHaveValue('Check connection');
    vi.mocked(window.confirm).mockReturnValue(true); fireEvent.keyDown(screen.getByLabelText('Description *'), { key: 'Escape' }); expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
  it.each([401, 403, 404])('clears loaded action content on protected response %s', async status => {
    show(); await view(); vi.mocked(api.getActions).mockRejectedValue(new api.ActionsError(status, status === 404 ? 'NOT_FOUND' : 'FORBIDDEN')); fireEvent.click(screen.getByRole('button', { name: 'Refresh actions' }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument()); expect(screen.queryByText('Existing network log')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument();
  });
  it('invalidates the session on 401 and rechecks forced password change', async () => {
    const invalidateSession = vi.fn(), checkAuth = vi.fn().mockResolvedValue(undefined); vi.mocked(api.getActions).mockRejectedValue(new api.ActionsError(401, 'UNAUTHENTICATED'));
    render(<AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout: vi.fn(), checkAuth, invalidateSession }}><ActionsTaken ticketId={3} ticketStatus="Open" /></AuthContext.Provider>);
    await waitFor(() => expect(invalidateSession).toHaveBeenCalledOnce());
  });
  it('never reports a fake empty state during loading or a safe load failure', async () => {
    vi.mocked(api.getActions).mockRejectedValue(new Error('private database details')); show(); expect(screen.getByText('Loading actions…')).toBeInTheDocument(); expect(screen.queryByText('No actions yet.')).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Retry loading actions' }); expect(screen.queryByText('No actions yet.')).not.toBeInTheDocument(); vi.mocked(api.getActions).mockResolvedValue(response([])); fireEvent.click(screen.getByRole('button', { name: 'Retry loading actions' })); await screen.findByText('No actions yet.');
  });
  it('retains a draft when staff lookup fails and can recover the selector', async () => {
    vi.mocked(legacy.getStaffUsers).mockRejectedValueOnce(new Error('offline')); show(); await create(); describeDraft(); expect(screen.getByLabelText('Assigned to *')).toBeDisabled();
    vi.mocked(legacy.getStaffUsers).mockResolvedValue({ users: [{ ...user }] }); fireEvent.click(screen.getByRole('button', { name: 'Retry assignees' })); await waitFor(() => expect(screen.getByLabelText('Assigned to *')).not.toBeDisabled()); expect(screen.getByLabelText('Description *')).toHaveValue('Check connection');
  });
  it('uses semantic labelled records with wrapping text for responsive card presentation', async () => {
    vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, description: '<img src=x onerror=alert(1)>' }])); show({ readOnly: true });
    const table = await screen.findByRole('table', { name: 'Actions Taken records' }); expect(within(table).getAllByRole('columnheader')).toHaveLength(8); expect(within(table).getByText('<img src=x onerror=alert(1)>', { selector: 'td' })).toHaveAttribute('data-label', 'Description'); expect(document.querySelector('img')).toBeNull();
  });
  it('blocks a retained draft when the latest action became cancelled', async () => {
    vi.mocked(api.updateAction).mockRejectedValueOnce(new api.ActionsError(409, 'STALE_VERSION'));
    show(); await view(); fireEvent.click(screen.getByRole('button', { name: 'Edit action' })); describeDraft('Keep my report'); fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByRole('button', { name: 'Load latest' }); vi.mocked(api.getActions).mockResolvedValue(response([{ ...action, status: 'CANCELLED', cancellationReason: 'No longer needed', version: 3 }], 4));
    fireEvent.click(screen.getByRole('button', { name: 'Load latest' })); await screen.findByText('This action is now read-only. Your draft is retained for reference.'); expect(screen.getByLabelText('Description *')).toHaveValue('Keep my report'); expect(screen.getByRole('button', { name: 'Save action' })).toBeDisabled();
  });
  it('rechecks authentication for forced password change without deleting its CSRF token', async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined); localStorage.setItem('csrfToken', 'change-password-token'); vi.mocked(api.getActions).mockRejectedValue(new api.ActionsError(403, 'PASSWORD_CHANGE_REQUIRED'));
    render(<AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout: vi.fn(), checkAuth }}><ActionsTaken ticketId={3} ticketStatus="Open" /></AuthContext.Provider>);
    await screen.findByText('Change your password before continuing.'); expect(checkAuth).toHaveBeenCalledOnce(); expect(localStorage.getItem('csrfToken')).toBe('change-password-token'); localStorage.clear();
  });
  it('accepts Unicode character boundaries and rejects oversized descriptions', async () => {
    show(); await create(); describeDraft('😀'.repeat(2001)); fireEvent.click(screen.getByRole('button', { name: 'Save action' })); expect(api.createAction).not.toHaveBeenCalled();
    describeDraft('😀'.repeat(2000)); fireEvent.click(screen.getByRole('button', { name: 'Save action' })); await screen.findByText('Action saved successfully.'); expect([...vi.mocked(api.createAction).mock.calls[0][1].description!]).toHaveLength(2000);
  });
});

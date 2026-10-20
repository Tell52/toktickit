import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StaffTicketDetail from '../../src/components/StaffTicketDetail';
import RequesterTicketDetail from '../../src/RequesterTicketDetail';
import * as api from '../../src/api';
import * as actions from '../../src/actions-api';
vi.mock('../../src/api');
vi.mock('../../src/actions-api', async original => ({ ...await original<typeof actions>(), getActions: vi.fn() }));
const user = { id: 's1', name: 'Staff One', role: 'IT_STAFF', email: 'staff@test.com' };
const ticket: api.StaffTicketDetailData = { id: 1, ticketNumber: 'TKT-0001', summary: 'Network unavailable', description: 'Investigate branch network', category: 'Network', relatedSystem: 'Router', requestedPriority: 'High', itPriority: 'High', status: 'In Progress', currentStatus: 'In Progress', owner: null, requester: { id: 'r1', name: 'Requester One' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', notes: [{ id: 'note1', authorId: user.id, authorName: user.name, content: 'PRIVATE_NOTE', createdAt: '2026-10-01T00:00:00Z' }], comments: [], attachments: [] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getStaffTicketDetail).mockResolvedValue(ticket);
  vi.mocked(api.getStaffUsers).mockResolvedValue({ users: [user] });
  vi.mocked(api.createComment).mockResolvedValue({});
  vi.mocked(actions.getActions).mockResolvedValue({ actions: [], pagination: { page: 1, pageSize: 20, totalCount: 0 }, ticketVersion: 1, resolutionCycle: 1 });
});
describe('Actions integration with Ticket Detail', () => {
  it('keeps the action draft mounted when a public comment refreshes the Ticket', async () => {
    render(<StaffTicketDetail ticketId={1} currentUser={user} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add action' })); fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'My retained action draft' } });
    fireEvent.change(screen.getByPlaceholderText(/Write a message visible to the requester/i), { target: { value: 'Public progress report' } }); fireEvent.click(screen.getByRole('button', { name: /Post Comment/i }));
    await waitFor(() => expect(api.getStaffTicketDetail).toHaveBeenCalledTimes(2)); expect(screen.getByLabelText('Description *')).toHaveValue('My retained action draft');
  });
  it('mounts Requester Actions read-only and never renders private notes or history', async () => {
    vi.mocked(api.getTicketDetail).mockResolvedValue({ ...ticket, category: { name: 'Network' }, relatedSystem: { name: 'Router' } });
    render(<RequesterTicketDetail ticketId="1" />); await screen.findByRole('heading', { name: 'Actions Taken' });
    expect(screen.queryByText('PRIVATE_NOTE')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Change history' })).not.toBeInTheDocument();
  });
  it('refreshes parent state with the latest versions and retains a now-read-only draft', async () => {
    const record: actions.ActionTaken = { id: 'a1', ticketId: 1, ticketNumber: ticket.ticketNumber, resolutionCycle: 1, actionAt: ticket.updatedAt, description: 'Inspect router', result: null, performedBy: { id: user.id, name: user.name }, assignee: { id: user.id, name: user.name, isActive: true }, status: 'PLANNED', followUpRequired: false, followUpNote: null, attachmentNotes: null, cancellationReason: null, version: 1, createdAt: ticket.updatedAt, updatedAt: ticket.updatedAt };
    vi.mocked(actions.getActions).mockResolvedValue({ actions: [record], pagination: { page: 1, pageSize: 20, totalCount: 1 }, ticketVersion: 1, resolutionCycle: 1 });
    render(<StaffTicketDetail ticketId={1} currentUser={user} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View action: Inspect router' })); fireEvent.click(screen.getByRole('button', { name: 'Edit action' })); fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Retained after closing' } });
    vi.mocked(api.getStaffTicketDetail).mockResolvedValue({ ...ticket, status: 'Closed', currentStatus: 'Closed' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh actions' })); await screen.findByText('Actions are read-only. Reopen the Ticket before recording new work.');
    expect(screen.getByLabelText('Description *')).toHaveValue('Retained after closing'); expect(screen.getByRole('button', { name: 'Save action' })).toBeDisabled();
  });
});

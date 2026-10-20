import { ActionStatus, ActionTaken } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { mergeAction, pagination, parseActionAt, parseActionInput, validateActionDate } from '../../src/services/action-validation';

const start = new Date('2026-10-01T00:00:00.000Z'), now = new Date('2026-10-20T10:00:00.000Z');
const current = (status: ActionStatus = 'PLANNED'): ActionTaken => ({
  id: '00000000-0000-4000-8000-000000000001', ticketId: 1, resolutionCycle: 1,
  performedById: '00000000-0000-4000-8000-000000000002', assigneeId: '00000000-0000-4000-8000-000000000003',
  actionAt: start, createdAt: start, updatedAt: start, description: 'Initial work', result: status === 'COMPLETED' ? 'Done' : null,
  status, followUpRequired: false, followUpNote: null, attachmentNotes: null,
  cancellationReason: status === 'CANCELLED' ? 'Cancelled work' : null, version: 1,
});
describe('Action validation (UNIT-01..03)', () => {
  it('trims text, counts Unicode characters, normalizes optional blanks and preserves omitted defaults for hashing', () => {
    const input = parseActionInput({ expectedTicketVersion: 1, description: ` ${'😀'.repeat(2000)} `, result: ' ', followUpNote: '', attachmentNotes: null });
    expect(Array.from(input.description!)).toHaveLength(2000);
    expect(input).toMatchObject({ result: null, followUpNote: null, attachmentNotes: null });
    expect(input).not.toHaveProperty('actionAt');
    expect(input).not.toHaveProperty('assigneeId');
    expect(input).not.toHaveProperty('followUpRequired');
  });
  it.each([
    ['description', ''], ['description', ' \t\n'], ['description', 'x'.repeat(2001)], ['description', null],
    ['description', 'invalid\0text'], ['description', '\ud800'],
    ['result', 'x'.repeat(2001)], ['result', 4], ['followUpNote', 'x'.repeat(1001)],
    ['attachmentNotes', 'x'.repeat(1001)], ['followUpRequired', 'true'], ['followUpRequired', null],
    ['assigneeId', null], ['assigneeId', 'not-a-uuid'], ['expectedTicketVersion', '1'],
    ['expectedTicketVersion', 0], ['expectedTicketVersion', 1.1], ['expectedTicketVersion', 2_147_483_648],
    ['performedById', 'spoof'], ['status', 'COMPLETED'], ['resolutionCycle', 2], ['createdAt', now.toISOString()],
  ])('rejects invalid create field %s = %j', (field, value) => {
    expect(() => parseActionInput({ expectedTicketVersion: 1, description: 'Work', [field]: value })).toThrow();
  });
  it.each([null, [], 'text', 10])('requires an object body (%j)', body => expect(() => parseActionInput(body)).toThrow());
  it.each(['2026-10-20', '2026-10-20T10:00:00', '2026-02-30T10:00:00Z', '2026-13-01T00:00:00Z', '2026-10-20T24:00:00Z', '2026-10-20T10:60:00Z', '2026-10-20T10:00:00+24:00', '0000-01-01T00:00:00Z'])('rejects invalid/local-only actionAt %s', value => expect(() => parseActionAt(value)).toThrow());
  it('normalizes offsets and accepts leap days and inclusive Ticket/server bounds', () => {
    expect(parseActionAt('2026-10-20T17:00:00+07:00')).toEqual(now);
    expect(parseActionAt('2024-02-29T00:00:00Z').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(() => validateActionDate(start, start, now)).not.toThrow();
    expect(() => validateActionDate(now, start, now)).not.toThrow();
    expect(() => validateActionDate(new Date(+start - 1), start, now)).toThrow();
    expect(() => validateActionDate(new Date(+now + 1), start, now)).toThrow();
  });
  it('validates final merged state, clears omitted follow-up note, and keeps the current completed Result', () => {
    const action = { ...current('COMPLETED'), followUpRequired: true, followUpNote: 'Check later' };
    const input = parseActionInput({ expectedTicketVersion: 1, expectedVersion: 1, followUpRequired: false }, true);
    expect(mergeAction(action, input, now, start)).toMatchObject({ result: 'Done', followUpRequired: false, followUpNote: null });
    expect(() => mergeAction(action, { ...input, followUpNote: 'Keep note' }, now, start)).toThrow();
    expect(() => mergeAction(action, { ...input, result: null }, now, start)).toThrow();
    expect(() => mergeAction(current(), { expectedTicketVersion: 1, expectedVersion: 1, followUpRequired: true }, now, start)).toThrow();
    expect(() => mergeAction(current(), { expectedTicketVersion: 1, expectedVersion: 1, description: 'Initial work' }, now, start)).toThrow();
  });
  const allowed: Record<ActionStatus, ActionStatus[]> = { PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };
  it.each(Object.values(ActionStatus).flatMap(from => Object.values(ActionStatus).map(to => [from, to] as const)))('covers action matrix %s -> %s', (from, to) => {
    const change = () => mergeAction(current(from), {
      expectedTicketVersion: 1, expectedVersion: 1, status: to,
      ...(to === 'COMPLETED' ? { result: 'Work complete' } : {}), ...(to === 'CANCELLED' ? { cancellationReason: 'No longer needed' } : {}),
    }, now, start);
    if (allowed[from].includes(to)) expect(change().status).toBe(to);
    else expect(change).toThrow();
  });
  it('rejects empty patches, unknown mutable fields and malformed pagination', () => {
    expect(() => parseActionInput({ expectedTicketVersion: 1, expectedVersion: 1 }, true)).toThrow();
    expect(() => parseActionInput({ expectedTicketVersion: 1, expectedVersion: 1, actorId: 'spoof' }, true)).toThrow();
    for (const query of [{ page: '0' }, { page: '1.5' }, { page: ['1', '2'] }, { pageSize: '51' }, { page: '2147483647' }, { requesterId: 'spoof' }]) expect(() => pagination(query)).toThrow();
    expect(pagination({})).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });
});

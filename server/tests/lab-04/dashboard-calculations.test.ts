import { describe, expect, it } from 'vitest';
import { dashboardWindow, effectivePriority, parseRequesterFilters } from '../../src/services/dashboard';

describe('Dashboard calendar and list validation', () => {
  it('normalizes effective priority and only falls back when IT priority is null', () => {
    expect(effectivePriority({ itPriority: null, requestedPriority: 'HIGH' })).toBe('High');
    expect(effectivePriority({ itPriority: 'low', requestedPriority: 'High' })).toBe('Low');
  });
  it.each([
    ['2026-10-20T10:00:00.000Z', '2026-10-13T17:00:00.000Z'],
    ['2026-10-20T17:00:00.000Z', '2026-10-14T17:00:00.000Z'],
    ['2026-01-01T00:00:00.000+07:00', '2025-12-25T17:00:00.000Z'],
    ['2024-03-01T12:00:00.000+07:00', '2024-02-23T17:00:00.000Z'],
  ])('uses Bangkok calendar dates for %s', (asOf, since) => {
    expect(dashboardWindow(new Date(asOf)).since.toISOString()).toBe(since);
  });
  it('converts equivalent offsets into equal instants', () => {
    expect(parseRequesterFilters({ updatedFrom: '2026-10-14T00:00:00+07:00' }).where).toEqual(parseRequesterFilters({ updatedFrom: '2026-10-13T17:00:00Z' }).where);
  });
  it.each([
    { requesterId: 'another-user' }, { page: '0' }, { page: '2.5' }, { limit: '51' }, { statusGroup: 'all' },
    { status: 'New', statusGroup: 'active' }, { status: ['New', 'Closed'] }, { sort: 'passwordHash' },
    { updatedFrom: '2026-10-13' }, { updatedFrom: '2026-02-30T00:00:00Z' }, { updatedFrom: '2026-10-13T24:00:00Z' },
    { updatedFrom: '2026-10-13T00:00:00+25:00' }, { updatedFrom: '2026-10-13T00:00:00Z', updatedBefore: '2026-10-13T00:00:00Z' },
  ])('rejects invalid filters %j', query => expect(() => parseRequesterFilters(query)).toThrow());
});

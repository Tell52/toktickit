import { afterEach, expect, it, vi } from 'vitest';
import { getMyTickets, getRequesterDashboard } from '../../src/api';
afterEach(() => vi.unstubAllGlobals());
it('loads the role-specific dashboard with cookies and no browser cache', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ metrics: { openTickets: 2 } }), { status: 200 })); vi.stubGlobal('fetch', fetch);
  expect(await getRequesterDashboard()).toEqual({ metrics: { openTickets: 2 } });
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/dashboard\/requester$/); expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
});
it('preserves drill-down filters and pagination without sending a client identity override', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { status: 200 })); vi.stubGlobal('fetch', fetch);
  const query = { statusGroup: 'resolved', resolvedFrom: '2026-10-13T17:00:00Z', resolvedBefore: '2026-10-20T10:00:00Z', sort: '-resolvedAt', limit: 5, page: 2, search: 'router', requesterId: 'victim' };
  await getMyTickets('caller-controlled', query);
  const actual = Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams);
  expect(actual).toEqual({ statusGroup: 'resolved', resolvedFrom: query.resolvedFrom, resolvedBefore: query.resolvedBefore, sort: '-resolvedAt', limit: '5', page: '2', search: 'router' });
});
it('preserves HTTP status for safe forbidden/session handling', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), { status: 403 })));
  await expect(getRequesterDashboard()).rejects.toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
});

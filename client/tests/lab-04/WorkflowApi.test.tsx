import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTicketStatusHistory, updateStaffTicketStatus, updateStaffTicketOwner, updateStaffTicketPriority } from '../../src/api';

beforeEach(() => { localStorage.setItem('csrfToken', 'test-csrf'); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('Workflow HTTP contract', () => {
  it('sends cancellation reason, observed version, session cookies and CSRF', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetch);
    await updateStaffTicketStatus(12, 'Cancelled', 7, 'Duplicate request');
    const [url, options] = fetch.mock.calls[0]; expect(url).toMatch(/\/api\/staff\/tickets\/12\/status$/);
    expect(options.credentials).toBe('include'); expect(options.method).toBe('PATCH'); expect(options.headers.get('X-CSRF-Token')).toBe('test-csrf');
    expect(JSON.parse(options.body)).toEqual({ status: 'Cancelled', expectedTicketVersion: 7, reason: 'Duplicate request' });
  });
  it('omits reason for an ordinary status transition', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch);
    await updateStaffTicketStatus(12, 'Resolved', 8); expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status: 'Resolved', expectedTicketVersion: 8 });
  });
  it.each([401, 403, 404, 409, 500])('preserves HTTP %s for safe permission and conflict handling', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'TEST_ERROR' } }), { status })));
    await expect(updateStaffTicketStatus(12, 'Closed', 8)).rejects.toMatchObject({ status, error: { code: 'TEST_ERROR' } });
  });
  it('preserves status when an error response has no JSON payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream unavailable', { status: 502 })));
    await expect(updateStaffTicketStatus(12, 'Closed', 8)).rejects.toEqual({ status: 502 });
  });
  it('sends expected versions for owner and priority changes', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}'))); vi.stubGlobal('fetch', fetch);
    await updateStaffTicketOwner(12, null, 9); await updateStaffTicketPriority(12, 'LOW', 10);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ownerId: null, expectedTicketVersion: 9 });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ itPriority: 'LOW', expectedTicketVersion: 10 });
  });
  it('loads bounded shared history without a cached response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"events":[],"pagination":{"page":2,"pageSize":20,"totalCount":21}}')); vi.stubGlobal('fetch', fetch);
    await expect(getTicketStatusHistory('TKT-12', 2)).resolves.toHaveProperty('events');
    expect(fetch.mock.calls[0][0]).toMatch(/\/tickets\/TKT-12\/status-history\?page=2&pageSize=20$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
  });
});

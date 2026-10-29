import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
vi.mock('../../src/prisma.js', () => ({ getPrisma: vi.fn(() => ({ ticket: { findFirst: vi.fn() } })) }));

describe('Legacy Ticket identity fallback is closed', () => {
  it.each(['/api/tickets/1?requesterId=1', '/api/tickets/1?requesterId=2', '/api/tickets/999?requesterId=1'])('requires a session before looking up %s', async path => {
    const result = await request(app).get(path);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
    expect(getPrisma().ticket.findFirst).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';

const prisma = getPrisma();

describe('Requester Ticket Detail API Tests (Lab 3)', () => {
    let requesterCookie: string;
    let requesterCsrf: string;
    let otherRequesterCookie: string;
    let otherRequesterCsrf: string;
    let staffCookie: string;
    let staffCsrf: string;
    let ticketId: number;

    beforeAll(async () => {
        // Clean up any test users/tickets from previous runs
        await prisma.comment.deleteMany({ where: { authorId: { in: ['req-test-01', 'req-test-02', 'staff-test-01'] } } });
        await prisma.ticket.deleteMany({ where: { requesterId: { in: ['req-test-01', 'req-test-02'] } } });
        await prisma.user.deleteMany({ where: { id: { in: ['req-test-01', 'req-test-02', 'staff-test-01'] } } });

        const passwordHash = await bcrypt.hash('TestPass123!', 10);

        await prisma.user.createMany({
            data: [
                { id: 'req-test-01', name: 'Alice Requester', email: 'alice.req@test.com', role: 'REQUESTER', passwordHash },
                { id: 'req-test-02', name: 'Bob Requester', email: 'bob.req@test.com', role: 'REQUESTER', passwordHash },
                { id: 'staff-test-01', name: 'Sam Staff', email: 'sam.staff@test.com', role: 'IT_STAFF', passwordHash },
            ]
        });

        // Login as Alice (Requester)
        const reqRes = await request(app).post('/api/auth/login').send({ email: 'alice.req@test.com', password: 'TestPass123!' });
        requesterCookie = reqRes.headers['set-cookie'][0];
        requesterCsrf = reqRes.body.csrfToken;

        // Login as Bob (Other Requester)
        const bobRes = await request(app).post('/api/auth/login').send({ email: 'bob.req@test.com', password: 'TestPass123!' });
        otherRequesterCookie = bobRes.headers['set-cookie'][0];
        otherRequesterCsrf = bobRes.body.csrfToken;

        // Login as Sam (Staff)
        const staffRes = await request(app).post('/api/auth/login').send({ email: 'sam.staff@test.com', password: 'TestPass123!' });
        staffCookie = staffRes.headers['set-cookie'][0];
        staffCsrf = staffRes.body.csrfToken;

        // Create a ticket for Alice
        const tktRes = await request(app)
            .post('/api/tickets')
            .set('Cookie', requesterCookie)
            .set('x-csrf-token', requesterCsrf)
            .send({
                summary: 'Printer not printing',
                description: 'Printer in room 301 is jammed',
                category: 'Hardware',
                relatedSystemId: 1,
                requestedPriority: 'MEDIUM',
            });
        ticketId = tktRes.body.id;
    });

    afterAll(async () => {
        await prisma.comment.deleteMany({ where: { authorId: { in: ['req-test-01', 'req-test-02', 'staff-test-01'] } } });
        await prisma.ticket.deleteMany({ where: { requesterId: { in: ['req-test-01', 'req-test-02'] } } });
        await prisma.user.deleteMany({ where: { id: { in: ['req-test-01', 'req-test-02', 'staff-test-01'] } } });
    });

    describe('GET /api/tickets/:id without requesterId query param (Lab 3)', () => {
        it('returns ticket details using session auth', async () => {
            const res = await request(app)
                .get(`/api/tickets/${ticketId}`)
                .set('Cookie', requesterCookie);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(ticketId);
            expect(res.body.summary).toBe('Printer not printing');
            expect(Array.isArray(res.body.comments)).toBe(true);
        });

        it('returns 404 if another requester attempts to view this ticket', async () => {
            const res = await request(app)
                .get(`/api/tickets/${ticketId}`)
                .set('Cookie', otherRequesterCookie);

            expect(res.status).toBe(404);
        });

        it('allows IT staff to view the ticket', async () => {
            const res = await request(app)
                .get(`/api/tickets/${ticketId}`)
                .set('Cookie', staffCookie);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(ticketId);
        });
    });

    describe('POST /api/tickets/:id/comments', () => {
        it('allows owning requester to post a public comment', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Cookie', requesterCookie)
                .set('x-csrf-token', requesterCsrf)
                .send({ content: 'I tried restarting the printer.' });

            expect(res.status).toBe(201);
            expect(res.body.content).toBe('I tried restarting the printer.');
            expect(res.body.authorName).toBe('Alice Requester');
            expect(res.body.authorRole).toBe('REQUESTER');
            expect(res.body.ticketId).toBe(ticketId);
        });

        it('allows IT staff to post a public comment', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Cookie', staffCookie)
                .set('x-csrf-token', staffCsrf)
                .send({ content: 'We dispatched a technician.' });

            expect(res.status).toBe(201);
            expect(res.body.content).toBe('We dispatched a technician.');
            expect(res.body.authorName).toBe('Sam Staff');
            expect(res.body.authorRole).toBe('IT_STAFF');
        });

        it('rejects empty or whitespace-only comments (BR-16, AC-14)', async () => {
            const emptyRes = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Cookie', requesterCookie)
                .set('x-csrf-token', requesterCsrf)
                .send({ content: '' });

            expect(emptyRes.status).toBe(400);
            expect(emptyRes.body.error.code).toBe('VALIDATION_ERROR');

            const wsRes = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Cookie', requesterCookie)
                .set('x-csrf-token', requesterCsrf)
                .send({ content: '   ' });

            expect(wsRes.status).toBe(400);
            expect(wsRes.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('rejects comments from unauthenticated users', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .send({ content: 'Unauthenticated comment' });

            expect(res.status).toBe(401);
        });

        it('rejects comments from a requester who does not own the ticket', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Cookie', otherRequesterCookie)
                .set('x-csrf-token', otherRequesterCsrf)
                .send({ content: 'Intruder comment' });

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/tickets/:id/resolved-indicator (AC-08, FR-12, BR-05)', () => {
        it('sets problemAppearsResolved=true without changing ticket status', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/resolved-indicator`)
                .set('Cookie', requesterCookie)
                .set('x-csrf-token', requesterCsrf);

            expect(res.status).toBe(200);
            expect(res.body.problemAppearsResolved).toBe(true);
            expect(res.body.indicatedAt).toBeDefined();

            // Verify status is unchanged
            const checkRes = await request(app)
                .get(`/api/tickets/${ticketId}`)
                .set('Cookie', requesterCookie);

            expect(checkRes.status).toBe(200);
            expect(checkRes.body.problemAppearsResolved).toBe(true);
            expect(checkRes.body.currentStatus).toBe('New');
        });

        it('rejects resolution indicator from IT staff (only requester can indicate)', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/resolved-indicator`)
                .set('Cookie', staffCookie)
                .set('x-csrf-token', staffCsrf);

            expect(res.status).toBe(403);
        });

        it('rejects resolution indicator from non-owner requester', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/resolved-indicator`)
                .set('Cookie', otherRequesterCookie)
                .set('x-csrf-token', otherRequesterCsrf);

            expect(res.status).toBe(404);
        });
    });
});

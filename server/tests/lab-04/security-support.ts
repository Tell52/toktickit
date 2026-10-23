import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { MigrationHarness } from './migration-support';

export const securityUrl = process.env.LAB4_SECURITY_DATABASE_URL;
export const password = 'SecurityPass!123';
export type Actor = 'r1' | 'r2' | 'staff' | 'otherStaff' | 'admin' | 'forced';
export type Session = { cookie: string; csrf: string };
export class SecurityFixture {
  db!: PrismaClient;
  private harness!: MigrationHarness;
  private directory!: string;
  private oldUrl = process.env.DATABASE_URL;
  ids = Object.fromEntries(['r1', 'r2', 'staff', 'otherStaff', 'admin', 'forced'].map(a => [a, randomUUID()])) as Record<Actor, string>;
  sessions = {} as Record<Actor, Session>;
  categoryId!: number; relatedSystemId!: number;
  async setup() {
    this.directory = mkdtempSync(join(tmpdir(), 'toktickit-hardening-'));
    this.harness = new MigrationHarness(securityUrl!, this.directory);
    const url = await this.harness.database(); this.harness.deploy(url, true);
    process.env.DATABASE_URL = url; this.db = getPrisma();
    this.categoryId = (await this.db.category.create({ data: { name: 'Hardening hardware' } })).id;
    this.relatedSystemId = (await this.db.relatedSystem.create({ data: { name: 'Hardening network' } })).id;
    const passwordHash = await bcrypt.hash(password, 10);
    for (const [alias, id] of Object.entries(this.ids)) {
      const role: Role = alias === 'admin' ? 'ADMINISTRATOR' : alias.toLowerCase().includes('staff') ? 'IT_STAFF' : 'REQUESTER';
      await this.db.user.create({ data: { id, name: alias, email: `${id}@hardening.invalid`, role, passwordHash, mustChangePassword: alias === 'forced' } });
      this.sessions[alias as Actor] = await this.login(alias as Actor);
    }
  }
  async login(actor: Actor): Promise<Session> {
    const result = await request(app).post('/api/auth/login').send({ email: `${this.ids[actor]}@hardening.invalid`, password });
    if (result.status !== 200) throw new Error(`Fixture login failed: ${result.status}`);
    return { cookie: result.headers['set-cookie'][0], csrf: result.body.csrfToken };
  }
  ticket() { return this.db.ticket.create({ data: { ticketNumber: `SEC-${randomUUID()}`, summary: 'Security scenario', description: 'Shared description', requestedPriority: 'Medium', currentStatus: 'In Progress', requesterId: this.ids.r1, ownerId: this.ids.otherStaff, categoryId: this.categoryId, relatedSystemId: this.relatedSystemId, createdAt: new Date('2026-01-01Z') } }); }
  body() { return { summary: 'Authenticated creation', description: 'Requester comes from session', categoryId: this.categoryId, relatedSystemId: this.relatedSystemId, requestedPriority: 'High' }; }
  async close() {
    await this.db?.$disconnect();
    if (this.oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = this.oldUrl;
    try { await this.harness?.close(); }
    finally {
      if (this.directory && resolve(dirname(this.directory)) === resolve(tmpdir()) && basename(this.directory).startsWith('toktickit-hardening-')) rmSync(this.directory, { recursive: true, force: true });
    }
  }
}

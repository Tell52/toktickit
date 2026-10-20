import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const migrationName = '20261020110000_lab4_actions_workflow';
export const serverRoot = resolve(import.meta.dirname, '../..');
const migrationsRoot = join(serverRoot, 'prisma/migrations');
export const migrationSql = readFileSync(join(migrationsRoot, migrationName, 'migration.sql'), 'utf8');

// Never use DATABASE_URL here: this suite creates/drops ONLY its generated
// databases on the explicitly supplied disposable PostgreSQL server.
export class MigrationHarness {
  private readonly admin: PrismaClient;
  private readonly allocated = new Set<string>();
  constructor(private readonly baseUrl: string, readonly directory: string) {
    const parsed = new URL(baseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('PostgreSQL URL required');
    this.admin = this.client(baseUrl);
  }

  client(url: string) {
    return new PrismaClient({ datasources: { db: { url } } });
  }

  async database() {
    const name = `toktickit_lab4_${randomUUID().replaceAll('-', '')}`;
    await this.admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    this.allocated.add(name);
    const url = new URL(this.baseUrl);
    url.pathname = `/${name}`;
    url.search = '?schema=public';
    return url.toString();
  }

  deploy(url: string, includeLab4: boolean) {
    const folder = join(this.directory, `prisma-${randomUUID()}`);
    mkdirSync(join(folder, 'migrations'), { recursive: true });
    cpSync(join(serverRoot, 'prisma/schema.prisma'), join(folder, 'schema.prisma'));
    cpSync(join(migrationsRoot, 'migration_lock.toml'), join(folder, 'migrations/migration_lock.toml'));
    for (const name of readdirSync(migrationsRoot)) {
      if (/^\d+_/.test(name) && (name < migrationName || (includeLab4 && name === migrationName))) {
        cpSync(join(migrationsRoot, name), join(folder, 'migrations', name), { recursive: true });
      }
    }
    return this.prisma(url, ['migrate', 'deploy', '--schema', join(folder, 'schema.prisma')]);
  }

  resolveRolledBack(url: string) {
    return this.prisma(url, ['migrate', 'resolve', '--rolled-back', migrationName, '--schema', join(serverRoot, 'prisma/schema.prisma')]);
  }

  private prisma(url: string, args: string[]) {
    const result = spawnSync(process.execPath, [
      join(serverRoot, 'node_modules/prisma/build/index.js'), ...args,
    ], { cwd: this.directory, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 60_000 });
    if (result.error || result.status !== 0) throw new Error(`Migration deploy failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
    return result.stdout;
  }

  // Matching pg_dump/pg_restore binaries can be supplied locally, or executed
  // inside the disposable server container (also works with GitHub services).
  postgresTool(command: 'psql' | 'pg_dump' | 'pg_restore', url: string, args: string[], input?: Buffer | string) {
    const parsed = new URL(url);
    const container = process.env.LAB4_POSTGRES_CONTAINER;
    const connection = [
      '--host', container ? '127.0.0.1' : parsed.hostname,
      '--port', container ? '5432' : (parsed.port || '5432'),
      '--username', decodeURIComponent(parsed.username),
      '--dbname', decodeURIComponent(parsed.pathname.slice(1)), '--no-password',
    ];
    const password = decodeURIComponent(parsed.password);
    const executable = container ? 'docker' : (process.env[`${command.toUpperCase()}_PATH`] || command);
    const toolArgs = container
      ? ['exec', '-i', '--env', `PGPASSWORD=${password}`, container, command, ...connection, ...args]
      : [...connection, ...args];
    const result = spawnSync(executable, toolArgs, {
      env: { ...process.env, PGPASSWORD: password }, input, timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr.toString()}`);
    return result.stdout;
  }

  sql(url: string, sql: string) {
    return this.postgresTool('psql', url, ['--set', 'ON_ERROR_STOP=1'], sql).toString();
  }

  backup(url: string, name: string) {
    const bytes = this.postgresTool('pg_dump', url, ['--format=custom', '--no-owner', '--no-acl']);
    writeFileSync(join(this.directory, name), bytes);
    return bytes;
  }

  restore(url: string, bytes: Buffer) {
    this.postgresTool('pg_restore', url, ['--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'], bytes);
  }

  async close() {
    try {
      for (const name of this.allocated) {
        if (!/^toktickit_lab4_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe test database name');
        await this.admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
    } finally { await this.admin.$disconnect(); }
  }
}

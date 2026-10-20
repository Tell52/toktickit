import { PrismaClient } from '@prisma/client';
import { seedLab4Fixtures } from './lab4-fixtures.js';

// Fixed-clock metric datasets must be opt-in and isolated from the normal demo.
const url = process.env.LAB4_FIXTURE_DATABASE_URL;
if (!url) throw new Error('Set LAB4_FIXTURE_DATABASE_URL to a disposable fixture database.');
const profile = process.argv[2] ?? 'dashboard';
if (!['dashboard', 'boundaries', 'empty'].includes(profile)) throw new Error('Choose dashboard, boundaries or empty.');
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  const result = await seedLab4Fixtures(prisma, { profile: profile as 'dashboard' | 'boundaries' | 'empty' });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}

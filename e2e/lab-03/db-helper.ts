import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';

export const prisma = new PrismaClient();

export async function createOrUpdateUser({
  email,
  name,
  password,
  role = 'REQUESTER',
  mustChangePassword = false,
  isActive = true,
}: {
  email: string;
  name: string;
  password: string;
  role?: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  mustChangePassword?: boolean;
  isActive?: boolean;
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role,
      mustChangePassword,
      isActive,
    },
    create: {
      name,
      email,
      passwordHash,
      role,
      mustChangePassword,
      isActive,
    },
  });
}

export async function createTestTicket({
  requesterId,
  summary,
  description,
  currentStatus = 'IN_PROGRESS',
  requestedPriority = 'MEDIUM',
  itPriority = 'MEDIUM',
}: {
  requesterId: string;
  summary: string;
  description: string;
  currentStatus?: string;
  requestedPriority?: string;
  itPriority?: string;
}) {
  const category = await prisma.category.findFirst();
  const relatedSystem = await prisma.relatedSystem.findFirst();

  const ticketNumber = `TKT-E2E-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return prisma.ticket.create({
    data: {
      ticketNumber,
      summary,
      description,
      requestedPriority,
      itPriority,
      currentStatus,
      problemAppearsResolved: false,
      indicatedAt: null,
      requesterId,
      categoryId: category!.id,
      relatedSystemId: relatedSystem!.id,
    },
  });
}

export async function cleanupTestUsers(emails: string[]) {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await prisma.comment.deleteMany({
      where: { authorId: { in: userIds } },
    });
    await prisma.ticket.deleteMany({
      where: { requesterId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

import { PrismaClient } from '../../server/node_modules/@prisma/client';
// @ts-ignore
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
  ownerId = null,
}: {
  requesterId: string;
  summary: string;
  description: string;
  currentStatus?: string;
  requestedPriority?: string;
  itPriority?: string;
  ownerId?: string | null;
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
      ownerId,
      categoryId: category!.id,
      relatedSystemId: relatedSystem!.id,
    },
  });
}

export async function createTestNote({
  ticketId,
  authorId,
  content,
}: {
  ticketId: number;
  authorId: string;
  content: string;
}) {
  return prisma.note.create({
    data: {
      ticketId,
      authorId,
      content,
    },
  });
}

export async function createTestComment({
  ticketId,
  authorId,
  content,
}: {
  ticketId: number;
  authorId: string;
  content: string;
}) {
  return prisma.comment.create({
    data: {
      ticketId,
      authorId,
      content,
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
    // 1. Delete notes authored by users or attached to their tickets
    await prisma.note.deleteMany({
      where: {
        OR: [
          { authorId: { in: userIds } },
          { ticket: { requesterId: { in: userIds } } },
        ],
      },
    });

    // 2. Delete comments authored by users or attached to their tickets
    await prisma.comment.deleteMany({
      where: {
        OR: [
          { authorId: { in: userIds } },
          { ticket: { requesterId: { in: userIds } } },
        ],
      },
    });

    // 3. Delete attachments on tickets requested by these users
    await prisma.attachment.deleteMany({
      where: {
        ticket: { requesterId: { in: userIds } },
      },
    });

    // 4. Nullify ownerId for any tickets owned by these users
    await prisma.ticket.updateMany({
      where: { ownerId: { in: userIds } },
      data: { ownerId: null },
    });

    // 5. Delete tickets requested by these users
    await prisma.ticket.deleteMany({
      where: { requesterId: { in: userIds } },
    });

    // 6. Delete users
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

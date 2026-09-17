import { getPrisma } from "../src/prisma.js";
import { Role } from "@prisma/client";
import bcrypt from "bcrypt";

async function main() {
  const prisma = getPrisma();
  console.log("Start seeding data...");

  // ==========================================
  // 1. Seed Categories (จากของเดิม)
  // ==========================================
  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network"
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name: name },
      update: {},
      create: { name: name }
    });
  }
  console.log("Categories seeded successfully.");

  // ==========================================
  // 2. Seed Related Systems (จากของเดิม)
  // ==========================================
  const systems = [
    "Email", "Campus Wi-Fi", "VPN", "LEB2 App", "Grade Submission App", "Printer", "Corporate Laptop"
  ];

  for (const sys of systems) {
    await prisma.relatedSystem.upsert({
      where: { name: sys },
      update: {},
      create: { name: sys },
    });
  }
  console.log("Related Systems seeded successfully.");

  // ==========================================
  // 3. Seed Users (Lab 3)
  // ==========================================
  const defaultPassword = await bcrypt.hash('Str0ng!Temp', 10);

  // 3.1 Admin (1 Active)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@example.com',
      passwordHash: defaultPassword,
      role: Role.ADMINISTRATOR,
      isActive: true,
      mustChangePassword: true,
    },
  });

  // 3.2 IT Staff (3 Active, 1 Inactive)
  const staffData = [
    { name: 'Michael Brown', email: 'michael@example.com', isActive: true },
    { name: 'Sarah Johnson', email: 'sarah@example.com', isActive: true },
    { name: 'David Lee', email: 'david@example.com', isActive: true },
    { name: 'Inactive Staff', email: 'istaff@example.com', isActive: false },
  ];

  const staffUsers = [];
  for (const staff of staffData) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        ...staff,
        passwordHash: defaultPassword,
        role: Role.IT_STAFF,
        mustChangePassword: true,
      },
    });
    staffUsers.push(user);
  }

  // 3.3 Requesters (4 Active, 1 Inactive)
  const requesterData = [
    { name: 'Jennifer Anderson', email: 'jennifer@example.com', isActive: true },
    { name: 'Emily Davis', email: 'emily@example.com', isActive: true },
    { name: 'Kevin Patel', email: 'kevin@example.com', isActive: true },
    { name: 'Amanda Clark', email: 'amanda@example.com', isActive: true },
    { name: 'Inactive User', email: 'inactive@example.com', isActive: false },
  ];

  const requesters = [];
  for (const req of requesterData) {
    const user = await prisma.user.upsert({
      where: { email: req.email },
      update: {},
      create: {
        ...req,
        passwordHash: defaultPassword,
        role: Role.REQUESTER,
        mustChangePassword: true,
      },
    });
    requesters.push(user);
  }
  console.log("Users seeded successfully.");

  // ==========================================
  // 4. Seed Tickets, Comments & Notes (Lab 3)
  // ==========================================
  const ticketData = [
    {
      ticketNumber: 'TKT-2026-0001',
      summary: 'Laptop battery drains quickly',
      description: 'My laptop battery is draining much faster than usual.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'IN_PROGRESS', // แก้ชื่อฟิลด์ให้ตรง schema

      // เก็บชื่อ category กับ system ไว้เพื่อใช้กับ connect ด้านล่าง
      categoryName: 'Hardware',
      relatedSystemName: 'Corporate Laptop',

      // เรามี ID ของ User แล้ว ใช้ใส่ตรงๆ ในฟิลด์ Foreign Key ได้เลย
      requesterId: requesters[0].id,
      ownerId: staffUsers[0].id,
    }
  ];

  const tickets = [];
  for (const t of ticketData) {
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber: t.ticketNumber },
      update: {},
      create: {
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        description: t.description,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        requester: {
          connect: { id: t.requesterId }
        },
        owner: t.ownerId ? {
          connect: { id: t.ownerId }
        } : undefined,
        category: {
          connect: { name: t.categoryName }
        },
        relatedSystem: {
          connect: { name: t.relatedSystemName }
        }
      },
    });
    tickets.push(ticket);
  }

  // Comments (Public) & Notes (Internal)
  await prisma.comment.upsert({
    where: { id: 'seed-comment-001' },
    update: {},
    create: {
      id: 'seed-comment-001',
      content: 'Thank you for the update. Please let me know if you need more info.',
      ticketId: tickets[0].id,
      authorId: requesters[0].id,
    }
  });

  await prisma.note.upsert({
    where: { id: 'seed-note-001' },
    update: {},
    create: {
      id: 'seed-note-001',
      content: 'Checked the battery health in system logs, looks like it needs hardware replacement.',
      ticketId: tickets[0].id,
      authorId: staffUsers[0].id,
    }
  });

  console.log("Tickets, Comments, and Notes seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
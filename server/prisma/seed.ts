import { getPrisma } from "../src/prisma.js";

// Issue 3 — seed the four supported categories.
// The four names are: Account and Access, Hardware, Software, Network.
// Requirement: running the seed twice must NOT create duplicates.
// Hint: prisma.category.upsert({ where:{name}, update:{}, create:{name} }).
async function main() {
  const prisma = getPrisma();

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

  const requesters = [
    { name: "Jennifer Anderson", email: "jennifer@example.com", isActive: true },
    { name: "Michael Brown", email: "michael@example.com", isActive: true },
    { name: "Sarah Johnson", email: "sarah@example.com", isActive: true },
    { name: "David Lee", email: "david@example.com", isActive: true },
    { name: "Inactive User", email: "inactive@example.com", isActive: false },
  ];

  for (const req of requesters) {
    await prisma.requester.upsert({
      where: { email: req.email },
      update: {},
      create: req,
    });
  }

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
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
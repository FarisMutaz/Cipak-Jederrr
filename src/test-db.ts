import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    console.log("Querying users...");
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        outlets: {
          where: { deletedAt: null },
          select: {
            outlet: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    console.log("Users found:", users.length);
    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role.name,
      roleId: u.role.id,
      outlets: u.outlets.map((uo) => uo.outlet),
    }));
    console.log("Formatted users sample:", formatted.slice(0, 3));
  } catch (error) {
    console.error("Error running query:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);



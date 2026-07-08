import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
console.log("DB URL:", connectionString);
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const users = await prisma.user.findMany({
      include: { role: true }
    });
    console.log("Users:", users.map(u => ({ id: u.id, username: u.username, status: u.status, role: u.role.name })));
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}

main().catch(console.error).finally(() => pool.end());

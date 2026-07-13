import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

import { parse } from 'pg-connection-string';

const connectionString = process.env.DATABASE_URL || "";
console.log("DB URL:", connectionString);
const parsedConfig = parse(connectionString);
const pool = new pg.Pool({
  host: parsedConfig.host || undefined,
  port: parsedConfig.port ? parseInt(parsedConfig.port, 10) : undefined,
  user: parsedConfig.user || undefined,
  password: parsedConfig.password || undefined,
  database: parsedConfig.database || undefined,
  ssl: connectionString.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const users = await prisma.user.findMany({
      include: { role: true }
    });
    console.log("Users:", users.map(u => ({ id: u.id, username: u.username, status: u.status, role: u.role.name })));
  } catch (err: any) {
    console.error("Database connection failed:");
    console.error("keys of err:", Object.keys(err));
    if (err.meta) {
      console.error("meta:", err.meta);
      console.error("keys of meta:", Object.keys(err.meta));
      const meta = err.meta as any;
      console.error("driverAdapterError:", meta.driverAdapterError);
      if (meta.driverAdapterError) {
        console.error("keys of driverAdapterError:", Object.keys(meta.driverAdapterError));
        console.error("cause of driverAdapterError:", meta.driverAdapterError.cause);
        if (meta.driverAdapterError.cause) {
          console.error("keys of cause:", Object.keys(meta.driverAdapterError.cause));
          console.error("message of cause:", meta.driverAdapterError.cause.message);
          console.error("stack of cause:", meta.driverAdapterError.cause.stack);
        }
      }
    }
  }
}

main().catch(console.error).finally(() => pool.end());

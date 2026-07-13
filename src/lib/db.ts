import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { parse } from 'pg-connection-string';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/cipak_pos";
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

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

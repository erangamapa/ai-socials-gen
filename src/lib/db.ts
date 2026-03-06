import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

let _prisma: PrismaClient | null = null;

function createClient(): PrismaClient {
  const connectionString =
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Neither DIRECT_DATABASE_URL nor DATABASE_URL is set in the environment"
    );
  }

  const pool = new pg.Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on("error", () => {});
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) _prisma = createClient();
    return (_prisma as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const getPrisma = () => {
  if (!_prisma) _prisma = createClient();
  return _prisma;
};

export const resetPrisma = () => {
  _prisma = null;
  _prisma = createClient();
  return _prisma;
};

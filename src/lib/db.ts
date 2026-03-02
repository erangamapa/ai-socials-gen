import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

let _prisma: PrismaClient | null = null;

function createClient(): PrismaClient {
  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: 51214,
    user: "postgres",
    password: "postgres",
    database: "template1",
    max: 1,
    idleTimeoutMillis: 1,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
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

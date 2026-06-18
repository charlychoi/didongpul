import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma() {
  const rawUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  let url: string;
  if (rawUrl.startsWith("file:./") || rawUrl.startsWith("file:../")) {
    const rel = rawUrl.slice("file:".length);
    url = `file:${path.resolve(process.cwd(), rel)}`;
  } else {
    url = rawUrl;
  }
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const adapter = new PrismaLibSql({ url, ...(authToken ? { authToken } : {}) });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma || createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

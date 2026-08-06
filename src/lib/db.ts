import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseUrl } from "./database-url";

// 开发模式下 Next.js 会热重载模块，不缓存实例会开出一堆连接
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl() }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

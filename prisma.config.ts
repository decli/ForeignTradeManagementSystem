import path from "node:path";
import process from "node:process";
import { defineConfig } from "prisma/config";
import { DEFAULT_DATABASE_URL } from "./src/lib/database-url";

// Prisma CLI 不会自动读 .env（Next.js 运行时会）。用 Node 内置的 loadEnvFile，
// 省掉一个 dotenv 依赖。文件不存在时忽略（CI 里用真实环境变量）。
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env 不存在，走进程环境变量
}

/**
 * 切换 MySQL 的完整清单（共三处）：
 *   1. prisma/schema.prisma 的 datasource provider 改成 "mysql"
 *   2. 下面 migrations.path 改成 migrations-mysql（两种方言的 DDL 不同，不能混用同一目录）
 *   3. src/lib/db.ts 与 prisma/seed.ts 里的 adapter 换成 @prisma/adapter-mariadb
 * 应用代码本身不用动。
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations-sqlite"),
    seed: "tsx prisma/seed.ts",
  },
  // 不用 env()：它在变量缺失时直接抛错，会让全新 clone 的 `npm install`
  // 在 postinstall 跑 prisma generate 时就失败——那时用户还没来得及创建 .env。
  datasource: { url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL },
});

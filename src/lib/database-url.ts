/**
 * 数据库连接串的唯一来源。
 *
 * 默认值存在的理由：全新 clone 时 `npm install` 的 postinstall 会跑 `prisma generate`，
 * 那一刻用户还没机会创建 .env。缺省到本地 SQLite 文件才能真正做到开箱即用。
 * 生产环境请在 .env 或进程环境变量里显式设置 DATABASE_URL。
 */
export const DEFAULT_DATABASE_URL = "file:./dev.db";

export const databaseUrl = () => process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

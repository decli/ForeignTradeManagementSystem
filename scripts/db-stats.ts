/** 小工具：快速看一眼库里的关键计数，排查问题时比开 Prisma Studio 快 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseUrl } from "../src/lib/database-url.js";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl() }) });
  console.log({
    出运批次: await db.shipment.count({ where: { archived: false } }),
    已归档批次: await db.shipment.count({ where: { archived: true } }),
    订单: await db.pi.count(),
    退税发票: await db.taxInvoice.count(),
    未关联发票: await db.taxInvoice.count({ where: { piId: null } }),
    审计记录: await db.auditLog.count(),
  });
  await db.$disconnect();
}
main();

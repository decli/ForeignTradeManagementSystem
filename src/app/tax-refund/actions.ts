"use server";

// 注意：这里不调用 revalidatePath。
// 它会让客户端按「规范路径」重新取数，把用户通过 router.replace 加上去的查询参数
// 丢掉——表现就是筛完之后随便改一条数据，筛选条件自己复位了。
// 改由调用方在写成功后 router.refresh()，那个是按当前 URL（含查询串）刷新的。

import { db } from "@/lib/db";

async function currentUserId() {
  const u = await db.user.findFirst({ where: { role: "admin" } });
  return u?.id ?? null;
}

/** 把发票行挂到 PI 上。未关联的行会拖慢整个退税申报，所以这是本页最重要的动作。 */
export async function linkInvoiceToPi(invoiceId: string, piId: string | null) {
  const actorId = await currentUserId();
  const before = await db.taxInvoice.findUnique({
    where: { id: invoiceId },
    select: { piId: true, invoiceNo: true },
  });
  if (!before) return { ok: false as const, error: "发票行不存在" };

  await db.taxInvoice.update({ where: { id: invoiceId }, data: { piId } });
  await db.auditLog.create({
    data: {
      actorId,
      entity: "TaxInvoice",
      entityId: invoiceId,
      action: piId ? "link" : "unlink",
      before: JSON.stringify(before),
      after: JSON.stringify({ piId }),
    },
  });

  return { ok: true as const, invoiceNo: before.invoiceNo, previousPiId: before.piId };
}

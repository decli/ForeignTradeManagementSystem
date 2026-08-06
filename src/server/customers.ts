import { db } from "@/lib/db";
import { centsToYuan, isoDate } from "@/lib/format";

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  country: string;
  contact: string | null;
  creditLevel: string;
  salesName: string;
  limit: number;
  used: number;
  /** 额度占用百分比，0 表示没设额度 */
  usedPct: number;
  timezone: string | null;
  note: string | null;
  orderCount: number;
  orderAmount: number;
  since: string;
};

export async function listCustomers(q?: string): Promise<CustomerRow[]> {
  const rows = await db.customer.findMany({
    where: {
      active: true,
      ...(q
        ? { OR: [{ name: { contains: q } }, { country: { contains: q } }, { code: { contains: q } }] }
        : {}),
    },
    include: {
      sales: { select: { name: true } },
      pis: { select: { amountCents: true, currency: true, signedOn: true } },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((c) => {
    const limit = centsToYuan(c.sinosureLimitCents);
    const used = centsToYuan(c.sinosureUsedCents);
    const signedDates = c.pis.map((p) => p.signedOn).filter((d): d is Date => Boolean(d));
    const earliest = signedDates.length
      ? new Date(Math.min(...signedDates.map((d) => d.getTime())))
      : c.createdAt;

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      country: c.country,
      contact: c.contact,
      creditLevel: c.creditLevel,
      salesName: c.sales?.name ?? "—",
      limit,
      used,
      usedPct: limit > 0 ? Math.round((used / limit) * 100) : 0,
      timezone: c.timezone,
      note: c.note,
      orderCount: c.pis.length,
      orderAmount: c.pis.reduce((s, p) => s + centsToYuan(p.amountCents), 0),
      since: isoDate(earliest).slice(0, 7),
    };
  });
}

export async function getCustomerOrders(customerId: string) {
  const rows = await db.pi.findMany({
    where: { customerId },
    include: { costing: { select: { profitRateBp: true, settleState: true } } },
    orderBy: { signedOn: "desc" },
    take: 10,
  });
  return rows.map((p) => ({
    id: p.id,
    piNo: p.piNo,
    signedOn: isoDate(p.signedOn),
    amount: centsToYuan(p.amountCents),
    currency: p.currency,
    product: p.product,
    profitRate: (p.costing?.profitRateBp ?? 0) / 100,
    settleState: p.costing?.settleState ?? "未完结",
  }));
}

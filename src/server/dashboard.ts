import { db } from "@/lib/db";
import { centsToYuan, isoDate, rateFromE6 } from "@/lib/format";
import { PROFIT_WARN_PCT } from "@/lib/order-rules";

const DAY = 86_400_000;
const STALL_DAYS = 7;

export type Risk = {
  tone: "coral" | "amber" | "accent";
  title: string;
  detail: string;
  href: string;
};

/**
 * 看板首屏要回答的是「今天要处理什么」，所以风险清单排在图表前面。
 * 每一条都指向能直接处理它的页面。
 */
export async function dashboardData() {
  const now = new Date();
  const year = now.getFullYear();

  const [shipments, pis, taxRows, custom, customers] = await Promise.all([
    db.shipment.findMany({
      where: { archived: false },
      include: { milestones: true, sales: { select: { name: true } } },
    }),
    db.pi.findMany({
      where: { status: { not: "archived" } },
      include: {
        costing: true,
        customer: { select: { name: true, country: true } },
        sales: { select: { name: true } },
      },
    }),
    db.taxInvoice.findMany({ select: { taxCents: true, declareMonth: true, piId: true } }),
    db.fxRate.findFirst({ where: { kind: "custom" }, orderBy: { asOf: "desc" } }),
    db.customer.findMany({ select: { name: true, sinosureLimitCents: true, sinosureUsedCents: true } }),
  ]);

  const rate = rateFromE6(custom?.rateE6 ?? 6_700_000);
  const usdOf = (cents: bigint, currency: string) => {
    const v = centsToYuan(cents);
    return currency === "CNY" ? v / rate : v;
  };

  // ---- KPI ----
  const totalUsd = pis.reduce((s, p) => s + usdOf(p.amountCents, p.currency), 0);
  const warn = pis.filter((p) => (p.costing?.profitRateBp ?? 0) < PROFIT_WARN_PCT * 100).length;
  const loss = pis.filter((p) => (p.costing?.profitRateBp ?? 0) < 0).length;

  const stalled = shipments.filter((s) => {
    if (!s.latestNoteOn) return false;
    return Math.floor((now.getTime() - s.latestNoteOn.getTime()) / DAY) > STALL_DAYS;
  });
  const overdue = shipments.filter((s) =>
    s.milestones.some((m) => !m.actualOn && m.plannedOn && m.plannedOn.getTime() < now.getTime()),
  );
  const troubled = new Set([...stalled, ...overdue].map((s) => s.id));

  const shippedThisMonth = shipments.filter((s) => {
    const atd = s.milestones.find((m) => m.kind === "ATD")?.actualOn;
    return atd && atd.getFullYear() === year && atd.getMonth() === now.getMonth();
  }).length;

  const yearTax = taxRows
    .filter((t) => t.declareMonth.startsWith(String(year)))
    .reduce((s, t) => s + centsToYuan(t.taxCents), 0);
  const unlinkedTax = taxRows.filter((t) => !t.piId).length;

  // ---- 月度出运与订单额 ----
  const months = Array.from({ length: 8 }, (_, i) => i);
  const monthly = months.map((m) => {
    const label = `${m + 1}月`;
    const count = shipments.filter((s) => {
      const atd = s.milestones.find((x) => x.kind === "ATD")?.actualOn;
      return atd && atd.getFullYear() === year && atd.getMonth() === m;
    }).length;
    const amount = pis
      .filter((p) => p.signedOn && p.signedOn.getFullYear() === year && p.signedOn.getMonth() === m)
      .reduce((s, p) => s + usdOf(p.amountCents, p.currency), 0);
    return { label, count, amount };
  });

  // ---- 目的国 TOP ----
  const byCountry = new Map<string, number>();
  for (const p of pis) {
    const key = p.destination ?? p.customer.country;
    byCountry.set(key, (byCountry.get(key) ?? 0) + usdOf(p.amountCents, p.currency));
  }
  const countries = [...byCountry.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // ---- 业务员业绩 ----
  const bySales = new Map<string, { amount: number; rateSum: number; n: number }>();
  for (const p of pis) {
    const key = p.sales?.name ?? "未分配";
    const cur = bySales.get(key) ?? { amount: 0, rateSum: 0, n: 0 };
    cur.amount += usdOf(p.amountCents, p.currency);
    cur.rateSum += (p.costing?.profitRateBp ?? 0) / 100;
    cur.n += 1;
    bySales.set(key, cur);
  }
  const leaderboard = [...bySales.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, rate: v.n ? v.rateSum / v.n : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // ---- 利润率分布 ----
  const buckets = [
    { label: "<0", tone: "coral", test: (r: number) => r < 0 },
    { label: "0–11%", tone: "amber", test: (r: number) => r >= 0 && r < 11 },
    { label: "11–18%", tone: "accent", test: (r: number) => r >= 11 && r < 18 },
    { label: "18–25%", tone: "jade", test: (r: number) => r >= 18 && r < 25 },
    { label: ">25%", tone: "jade", test: (r: number) => r >= 25 },
  ].map((b) => ({
    label: b.label,
    tone: b.tone,
    count: pis.filter((p) => b.test((p.costing?.profitRateBp ?? 0) / 100)).length,
  }));

  // ---- 风险清单 ----
  const risks: Risk[] = [];
  if (stalled.length) {
    const worst = stalled
      .map((s) => ({
        no: s.batchNo,
        days: Math.floor((now.getTime() - s.latestNoteOn!.getTime()) / DAY),
      }))
      .sort((a, b) => b.days - a.days)[0];
    risks.push({
      tone: "coral",
      title: `${stalled.length} 个批次停滞超过 ${STALL_DAYS} 天`,
      detail: `${worst.no} 已停滞 ${worst.days} 天，最久没有新动态`,
      href: "/follow-ups",
    });
  }
  if (loss) {
    const one = pis.find((p) => (p.costing?.profitRateBp ?? 0) < 0);
    risks.push({
      tone: "coral",
      title: `${loss} 单预估为负毛利`,
      detail: one ? `${one.piNo} 利润率 ${((one.costing?.profitRateBp ?? 0) / 100).toFixed(2)}%，成本已超报价` : "需财务复核",
      href: "/orders?risk=1",
    });
  }
  if (overdue.length) {
    risks.push({
      tone: "coral",
      title: `${overdue.length} 个批次里程碑超期`,
      detail: "计划日已过但还没确认实际发生，需要跟货代确认",
      href: "/follow-ups",
    });
  }
  if (unlinkedTax) {
    risks.push({
      tone: "amber",
      title: `${unlinkedTax} 行退税发票未关联订单`,
      detail: "影响本期退税申报进度",
      href: "/tax-refund?unlinked=1",
    });
  }
  if (warn - loss > 0) {
    risks.push({
      tone: "amber",
      title: `${warn - loss} 单利润率低于 ${PROFIT_WARN_PCT}%`,
      detail: "已自动进入财务复核队列",
      href: "/orders?risk=1",
    });
  }
  const overLimit = customers.filter(
    (c) => Number(c.sinosureLimitCents) > 0 && Number(c.sinosureUsedCents) / Number(c.sinosureLimitCents) > 0.85,
  );
  if (overLimit.length) {
    risks.push({
      tone: "amber",
      title: `${overLimit.length} 家客户中信保额度占用超 85%`,
      detail: `${overLimit[0].name} 额度接近上限，再下单前需先回款`,
      href: "/customers",
    });
  }
  const noTodo = shipments.filter((s) => s.hasTodo).length;
  if (noTodo) {
    risks.push({
      tone: "accent",
      title: `${noTodo} 个批次有未完成待办`,
      detail: "在跟单表里标了待办，还没销掉",
      href: "/follow-ups",
    });
  }

  return {
    kpi: {
      totalUsd,
      shippedThisMonth,
      warn,
      loss,
      troubled: troubled.size,
      stalledMax: stalled.length
        ? Math.max(...stalled.map((s) => Math.floor((now.getTime() - s.latestNoteOn!.getTime()) / DAY)))
        : 0,
      yearTax,
      year,
    },
    monthly,
    countries,
    leaderboard,
    buckets,
    risks,
    asOf: isoDate(now),
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

import { db } from "@/lib/db";
import { centsToYuan, isoDate, rateFromE6 } from "@/lib/format";
import { PROFIT_WARN_PCT } from "@/lib/order-rules";

export type OrderRow = {
  id: string;
  piNo: string;
  signedOn: string;
  salesName: string;
  customerName: string;
  destination: string;
  product: string | null;
  sellerEntity: string | null;
  currency: string;
  /** 订单额，PI 本币 */
  amount: number;
  /** 采购成本，人民币 */
  purchaseCost: number;
  /** 应收，PI 本币 */
  receivable: number;
  /** 应付，人民币 */
  payable: number;
  /** 利润率百分比，可为负 */
  profitRate: number;
  settleState: string;
  reviewState: string;
  /** 数据不全时的提醒标签，如「费用估算未填」 */
  flag: string | null;
};

export type OrderFilters = {
  q?: string;
  settleState?: string;
  onlyRisk?: boolean;
  archived?: boolean;
};

function flagOf(c: {
  costEstimated: boolean;
  purchaseCostCents: bigint;
  profitRateBp: number;
}): string | null {
  if (c.profitRateBp < 0) return "亏损";
  if (Number(c.purchaseCostCents) === 0) return "采购成本未录";
  if (!c.costEstimated) return "费用估算未填";
  if (c.profitRateBp < PROFIT_WARN_PCT * 100) return "利润率偏低";
  return null;
}

export async function listOrders(filters: OrderFilters = {}): Promise<OrderRow[]> {
  const { q, settleState, onlyRisk, archived } = filters;

  const rows = await db.pi.findMany({
    where: {
      status: archived ? "archived" : { not: "archived" },
      ...(q
        ? {
            OR: [
              { piNo: { contains: q } },
              { product: { contains: q } },
              { sales: { name: { contains: q } } },
              { customer: { name: { contains: q } } },
            ],
          }
        : {}),
      ...(settleState ? { costing: { settleState } } : {}),
    },
    include: {
      customer: { select: { name: true, country: true } },
      sales: { select: { name: true } },
      sellerEntity: { select: { name: true } },
      costing: true,
    },
    orderBy: [{ signedOn: "desc" }, { piNo: "asc" }],
  });

  const mapped = rows.map((p): OrderRow => {
    const c = p.costing;
    return {
      id: p.id,
      piNo: p.piNo,
      signedOn: isoDate(p.signedOn).slice(5),
      salesName: p.sales?.name ?? "—",
      customerName: p.customer.name,
      destination: p.destination ?? p.customer.country,
      product: p.product,
      sellerEntity: p.sellerEntity?.name ?? null,
      currency: p.currency,
      amount: centsToYuan(p.amountCents),
      purchaseCost: c ? centsToYuan(c.purchaseCostCents) : 0,
      receivable: c ? centsToYuan(c.receivableCents) : 0,
      payable: c ? centsToYuan(c.payableCents) : 0,
      profitRate: c ? c.profitRateBp / 100 : 0,
      settleState: c?.settleState ?? "未完结",
      reviewState: c?.reviewState ?? "draft",
      flag: c ? flagOf(c) : "未建核算",
    };
  });

  return onlyRisk ? mapped.filter((r) => r.profitRate < PROFIT_WARN_PCT) : mapped;
}

export async function orderKpis() {
  const [all, custom] = await Promise.all([
    db.pi.findMany({
      where: { status: { not: "archived" } },
      select: { amountCents: true, currency: true, costing: { select: { settleState: true, profitRateBp: true } } },
    }),
    db.fxRate.findFirst({ where: { kind: "custom" }, orderBy: { asOf: "desc" } }),
  ]);

  const rate = rateFromE6(custom?.rateE6 ?? 6_700_000);

  // 人民币单按自定汇率折算并入美元口径，跟截图里「RMB 单按折算价并入」一致
  const totalUsd = all.reduce((sum, p) => {
    const amount = centsToYuan(p.amountCents);
    return sum + (p.currency === "CNY" ? amount / rate : amount);
  }, 0);

  return {
    total: all.length,
    unsettled: all.filter((p) => (p.costing?.settleState ?? "未完结") === "未完结").length,
    warn: all.filter((p) => (p.costing?.profitRateBp ?? 0) < PROFIT_WARN_PCT * 100).length,
    loss: all.filter((p) => (p.costing?.profitRateBp ?? 0) < 0).length,
    totalUsd,
  };
}

export async function getOrderDetail(id: string) {
  const p = await db.pi.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, country: true } },
      sales: { select: { name: true } },
      sellerEntity: { select: { name: true } },
      costing: true,
      shipments: {
        select: { id: true, batchNo: true, batchLabel: true, releaseState: true, containerNo: true },
        orderBy: { batchNo: "asc" },
      },
      taxInvoices: { select: { id: true, invoiceNo: true, taxCents: true } },
    },
  });
  if (!p) return null;

  const c = p.costing;
  const amount = centsToYuan(p.amountCents);
  const profitRate = c ? c.profitRateBp / 100 : 0;

  return {
    id: p.id,
    piNo: p.piNo,
    signedOn: isoDate(p.signedOn),
    customerName: p.customer.name,
    destination: p.destination ?? p.customer.country,
    salesName: p.sales?.name ?? "—",
    sellerEntity: p.sellerEntity?.name ?? null,
    product: p.product,
    currency: p.currency,
    amount,
    profitRate,
    grossProfit: (amount * profitRate) / 100,
    settleState: c?.settleState ?? "未完结",
    reviewState: c?.reviewState ?? "draft",
    receivable: c ? centsToYuan(c.receivableCents) : 0,
    payable: c ? centsToYuan(c.payableCents) : 0,
    // 成本构成，按人民币
    costs: [
      { label: "采购成本", value: c ? centsToYuan(c.purchaseCostCents) : 0, color: "var(--accent)" },
      { label: "海运及本地费", value: c ? centsToYuan(c.freightCents) : 0, color: "var(--violet)" },
      { label: "报关与单证", value: c ? centsToYuan(c.customsCents) : 0, color: "var(--amber)" },
      { label: "银行及汇兑", value: c ? centsToYuan(c.bankCents) : 0, color: "var(--text-3)" },
      { label: "其他", value: c ? centsToYuan(c.otherCents) : 0, color: "var(--jade)" },
    ].filter((x) => x.value > 0),
    shipments: p.shipments,
    taxInvoiceCount: p.taxInvoices.length,
    taxTotal: p.taxInvoices.reduce((s, t) => s + centsToYuan(t.taxCents), 0),
  };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

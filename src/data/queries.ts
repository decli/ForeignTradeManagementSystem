/**
 * 查询层 —— 原来是 `src/server/*` 里的 Prisma 查询，现在是对内存账套的纯函数。
 *
 * 全部同步：数据在内存里，React 直接 `useMemo` 就行，不需要 loading 状态的层层传递。
 * 视图模型的字段名与原后端保持一致，将来换回真后端时页面组件不用动。
 */

import { centsToYuan, daysBetween, isoDate, rateFromE6, shortDate } from "@/lib/format";
import { PROFIT_WARN_PCT, SINOSURE_WARN, STALL_DAYS } from "@/lib/rules";
import type { Database, Scope, ShipmentMilestone, User } from "./types";
import { tr } from "@/i18n";

// ───────────────────────── 数据范围 ─────────────────────────

export type Viewer = { id: string | null; name: string; role: string; scope: Scope; team: string | null };

/** scope=self 只看自己的行，team 看本组，all 看全部。admin / finance 天然是 all。 */
export function inScope(viewer: Viewer, ownerId: string | null, team: string | null) {
  if (viewer.scope === "all") return true;
  if (viewer.scope === "team") return !!team && team === viewer.team;
  return !!ownerId && ownerId === viewer.id;
}

// ───────────────────────── 里程碑 ─────────────────────────

export type MilestoneState = "done" | "now" | "late" | "pending";

export type MilestoneView = {
  kind: string;
  /** 紧凑日期，如 8.21；没有则为 — */
  value: string;
  state: MilestoneState;
  tip: string;
  planned: string | null;
  actual: string | null;
};

/**
 * 节点状态：
 *  - 有实际发生日期 → done
 *  - 第一个未发生的节点 → 计划日已过 late，否则 now
 *  - 其余未发生的 → pending
 */
export function toMilestoneViews(rows: ShipmentMilestone[], todayIso: string): MilestoneView[] {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const firstOpen = sorted.findIndex((m) => !m.actualOn);

  return sorted.map((m, i) => {
    let state: MilestoneState;
    let tip: string;

    if (m.actualOn) {
      state = "done";
      tip = `实际 ${m.actualOn} 已完成`;
    } else if (i === firstOpen) {
      const overdue = m.plannedOn ? m.plannedOn < todayIso : false;
      state = overdue ? "late" : "now";
      tip = m.plannedOn ? `计划 ${m.plannedOn}，${overdue ? "已超期未确认" : "进行中"}` : "尚未安排";
    } else {
      state = "pending";
      tip = m.plannedOn ? `计划 ${m.plannedOn}` : "尚未安排";
    }

    return { kind: m.kind, value: shortDate(m.actualOn ?? m.plannedOn), state, tip, planned: m.plannedOn, actual: m.actualOn };
  });
}

// ───────────────────────── 跟单表 ─────────────────────────

export type ShipmentRow = {
  id: string;
  batchNo: string;
  batchLabel: string | null;
  country: string;
  term: string;
  mode: string;
  fcl: boolean;
  containerNo: string | null;
  carrier: string | null;
  pod: string | null;
  releaseState: string;
  salesName: string;
  salesId: string | null;
  team: string | null;
  latestNote: string | null;
  latestNoteOn: string | null;
  hasTodo: boolean;
  piNo: string | null;
  piId: string | null;
  customerName: string | null;
  product: string | null;
  amount: number;
  milestones: MilestoneView[];
  /** 超过 STALL_DAYS 天没有新动态，0 表示正常 */
  stalledDays: number;
  hasLate: boolean;
  /** 排序用：下一个待办节点的日期 */
  nextDate: string | null;
  etaDate: string | null;
  atdDate: string | null;
};

export type ShipmentFilters = {
  q?: string;
  releaseState?: string;
  sales?: string;
  mode?: string;
  onlyActive?: boolean;
  onlyRisk?: boolean;
  onlyTodo?: boolean;
};

export function listShipments(db: Database, viewer: Viewer, f: ShipmentFilters = {}): ShipmentRow[] {
  const today = isoDate(new Date());
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const piById = new Map(db.pis.map((p) => [p.id, p]));
  const customerById = new Map(db.customers.map((c) => [c.id, c]));
  const msByShipment = new Map<string, ShipmentMilestone[]>();
  for (const m of db.milestones) {
    const arr = msByShipment.get(m.shipmentId);
    if (arr) arr.push(m);
    else msByShipment.set(m.shipmentId, [m]);
  }

  const q = f.q?.trim().toLowerCase();

  const rows = db.shipments
    .filter((s) => !s.archived)
    .filter((s) => inScope(viewer, s.salesId, s.team))
    .map((s): ShipmentRow => {
      const milestones = toMilestoneViews(msByShipment.get(s.id) ?? [], today);
      const p = s.piId ? piById.get(s.piId) : undefined;
      const c = p ? customerById.get(p.customerId) : undefined;
      const stalled = s.latestNoteOn ? daysBetween(today, s.latestNoteOn) : 0;
      const open = milestones.find((m) => m.state === "now" || m.state === "late");
      return {
        id: s.id,
        batchNo: s.batchNo,
        batchLabel: s.batchLabel,
        country: s.country,
        term: s.term,
        mode: s.mode,
        fcl: s.fcl,
        containerNo: s.containerNo,
        carrier: s.carrier,
        pod: s.pod,
        releaseState: s.releaseState,
        salesName: (s.salesId ? userById.get(s.salesId)?.name : null) ?? "—",
        salesId: s.salesId,
        team: s.team,
        latestNote: s.latestNote,
        latestNoteOn: s.latestNoteOn,
        hasTodo: s.hasTodo,
        piNo: p?.piNo ?? null,
        piId: p?.id ?? null,
        customerName: c?.name ?? null,
        product: p?.product ?? null,
        amount: p ? centsToYuan(p.amountCents) : 0,
        milestones,
        stalledDays: stalled > STALL_DAYS ? stalled : 0,
        hasLate: milestones.some((m) => m.state === "late"),
        nextDate: open?.planned ?? null,
        etaDate: milestones.find((m) => m.kind === "ETA")?.planned ?? null,
        atdDate: milestones.find((m) => m.kind === "ATD")?.actual ?? null,
      };
    })
    .filter((r) => {
      if (f.releaseState && r.releaseState !== f.releaseState) return false;
      if (f.sales && r.salesName !== f.sales) return false;
      if (f.mode && r.mode !== f.mode) return false;
      if (f.onlyRisk && !r.stalledDays && !r.hasLate) return false;
      if (f.onlyTodo && !r.hasTodo) return false;
      // 「仅进行中」= 还有节点没走完；全部走完的属于历史，不该占着当前视图
      if (f.onlyActive && !r.milestones.some((m) => m.state !== "done")) return false;
      if (q) {
        const hay = `${r.batchNo} ${r.containerNo ?? ""} ${r.country} ${r.customerName ?? ""} ${r.piNo ?? ""} ${r.pod ?? ""} ${r.latestNote ?? ""} ${r.salesName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

  return rows.sort((a, b) => (b.latestNoteOn ?? "").localeCompare(a.latestNoteOn ?? "") || a.batchNo.localeCompare(b.batchNo));
}

export type ShipmentDetail = ReturnType<typeof getShipmentDetail>;

export function getShipmentDetail(db: Database, id: string) {
  const s = db.shipments.find((x) => x.id === id);
  if (!s) return null;
  const p = s.piId ? db.pis.find((x) => x.id === s.piId) : undefined;
  const c = p ? db.customers.find((x) => x.id === p.customerId) : undefined;
  const userById = new Map(db.users.map((u) => [u.id, u]));

  return {
    id: s.id,
    batchNo: s.batchNo,
    batchLabel: s.batchLabel,
    country: s.country,
    term: s.term,
    mode: s.mode,
    fcl: s.fcl,
    containerNo: s.containerNo,
    carrier: s.carrier,
    pod: s.pod,
    releaseState: s.releaseState,
    team: s.team,
    hasTodo: s.hasTodo,
    salesName: (s.salesId ? userById.get(s.salesId)?.name : null) ?? "—",
    piNo: p?.piNo ?? null,
    piId: p?.id ?? null,
    product: p?.product ?? null,
    amount: p ? centsToYuan(p.amountCents) : 0,
    currency: p?.currency ?? "USD",
    customerName: c?.name ?? null,
    customerId: c?.id ?? null,
    customerTz: c?.timezone ?? null,
    latestNote: s.latestNote,
    milestones: toMilestoneViews(
      db.milestones.filter((m) => m.shipmentId === id),
      isoDate(new Date()),
    ),
    notes: db.notes
      .filter((n) => n.shipmentId === id)
      .sort((a, b) => b.happenedOn.localeCompare(a.happenedOn))
      .slice(0, 30)
      .map((n) => ({
        id: n.id,
        body: n.body,
        on: n.happenedOn,
        author: (n.authorId ? userById.get(n.authorId)?.name : null) ?? "系统",
      })),
  };
}

// ───────────────────────── 订单核算 ─────────────────────────

export type OrderRow = {
  id: string;
  piNo: string;
  signedOn: string;
  salesName: string;
  salesId: string | null;
  customerName: string;
  destination: string;
  product: string | null;
  sellerEntity: string | null;
  currency: string;
  amount: number;
  purchaseCost: number;
  receivable: number;
  payable: number;
  profitRate: number;
  grossProfit: number;
  settleState: string;
  reviewState: string;
  status: string;
  shipmentCount: number;
  /** 数据不全时的提醒标签，如「费用估算未填」 */
  flag: string | null;
};

export type OrderFilters = {
  q?: string;
  settleState?: string;
  sales?: string;
  entity?: string;
  onlyRisk?: boolean;
  archived?: boolean;
};

export function listOrders(db: Database, viewer: Viewer, f: OrderFilters = {}): OrderRow[] {
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const customerById = new Map(db.customers.map((c) => [c.id, c]));
  const entityById = new Map(db.sellerEntities.map((e) => [e.id, e]));
  const costingByPi = new Map(db.costings.map((c) => [c.piId, c]));
  const shipCount = new Map<string, number>();
  for (const s of db.shipments) if (s.piId && !s.archived) shipCount.set(s.piId, (shipCount.get(s.piId) ?? 0) + 1);

  const q = f.q?.trim().toLowerCase();

  return db.pis
    .filter((p) => (f.archived ? p.status === "archived" : p.status !== "archived"))
    .filter((p) => inScope(viewer, p.salesId, userById.get(p.salesId ?? "")?.team ?? null))
    .map((p): OrderRow => {
      const c = costingByPi.get(p.id);
      const cust = customerById.get(p.customerId);
      const amount = centsToYuan(p.amountCents);
      const profitRate = c ? c.profitRateBp / 100 : 0;
      return {
        id: p.id,
        piNo: p.piNo,
        signedOn: p.signedOn ?? "",
        salesName: (p.salesId ? userById.get(p.salesId)?.name : null) ?? "—",
        salesId: p.salesId,
        customerName: cust?.name ?? "—",
        destination: p.destination ?? cust?.country ?? "—",
        product: p.product,
        sellerEntity: (p.sellerEntityId ? entityById.get(p.sellerEntityId)?.name : null) ?? null,
        currency: p.currency,
        amount,
        purchaseCost: c ? centsToYuan(c.purchaseCostCents) : 0,
        receivable: c ? centsToYuan(c.receivableCents) : 0,
        payable: c ? centsToYuan(c.payableCents) : 0,
        profitRate,
        grossProfit: (amount * profitRate) / 100,
        settleState: c?.settleState ?? "未完结",
        reviewState: c?.reviewState ?? "draft",
        status: p.status,
        shipmentCount: shipCount.get(p.id) ?? 0,
        flag: c
          ? c.profitRateBp < 0
            ? "亏损"
            : c.purchaseCostCents === 0
              ? "采购成本未录"
              : !c.costEstimated
                ? "费用估算未填"
                : c.profitRateBp < PROFIT_WARN_PCT * 100
                  ? "利润率偏低"
                  : null
          : "未建核算",
      };
    })
    .filter((r) => {
      if (f.settleState && r.settleState !== f.settleState) return false;
      if (f.sales && r.salesName !== f.sales) return false;
      if (f.entity && r.sellerEntity !== f.entity) return false;
      if (f.onlyRisk && r.profitRate >= PROFIT_WARN_PCT) return false;
      if (q) {
        const hay = `${r.piNo} ${r.product ?? ""} ${r.salesName} ${r.customerName} ${r.destination}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.signedOn.localeCompare(a.signedOn) || a.piNo.localeCompare(b.piNo));
}

export function customRate(db: Database) {
  const fx = db.fxRates.filter((f) => f.kind === "custom").sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  return rateFromE6(fx?.rateE6 ?? 6_700_000);
}

export function marketRate(db: Database) {
  const fx = db.fxRates.filter((f) => f.kind === "market").sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  return rateFromE6(fx?.rateE6 ?? 6_739_200);
}

export function orderKpis(rows: OrderRow[], rate: number) {
  // 人民币单按自定汇率折算并入美元口径
  const totalUsd = rows.reduce((s, r) => s + (r.currency === "CNY" ? r.amount / rate : r.amount), 0);
  return {
    total: rows.length,
    unsettled: rows.filter((r) => r.settleState === "未完结").length,
    warn: rows.filter((r) => r.profitRate < PROFIT_WARN_PCT).length,
    loss: rows.filter((r) => r.profitRate < 0).length,
    totalUsd,
    avgRate: rows.length ? rows.reduce((s, r) => s + r.profitRate, 0) / rows.length : 0,
  };
}

export function getOrderDetail(db: Database, id: string) {
  const p = db.pis.find((x) => x.id === id);
  if (!p) return null;
  const c = db.costings.find((x) => x.piId === id);
  const cust = db.customers.find((x) => x.id === p.customerId);
  const amount = centsToYuan(p.amountCents);
  const profitRate = c ? c.profitRateBp / 100 : 0;

  return {
    id: p.id,
    piNo: p.piNo,
    signedOn: p.signedOn ?? "",
    customerName: cust?.name ?? "—",
    customerId: cust?.id ?? null,
    destination: p.destination ?? cust?.country ?? "—",
    salesName: db.users.find((u) => u.id === p.salesId)?.name ?? "—",
    sellerEntity: db.sellerEntities.find((e) => e.id === p.sellerEntityId)?.name ?? null,
    product: p.product,
    currency: p.currency,
    amount,
    profitRate,
    grossProfit: (amount * profitRate) / 100,
    settleState: c?.settleState ?? "未完结",
    reviewState: c?.reviewState ?? "draft",
    receivable: c ? centsToYuan(c.receivableCents) : 0,
    payable: c ? centsToYuan(c.payableCents) : 0,
    costs: [
      { label: tr("采购成本"), value: c ? centsToYuan(c.purchaseCostCents) : 0, tone: "accent" },
      { label: tr("海运及本地费"), value: c ? centsToYuan(c.freightCents) : 0, tone: "violet" },
      { label: tr("报关与单证"), value: c ? centsToYuan(c.customsCents) : 0, tone: "amber" },
      { label: tr("银行及汇兑"), value: c ? centsToYuan(c.bankCents) : 0, tone: "mute" },
      { label: tr("其他"), value: c ? centsToYuan(c.otherCents) : 0, tone: "jade" },
    ].filter((x) => x.value > 0),
    shipments: db.shipments
      .filter((s) => s.piId === id && !s.archived)
      .map((s) => ({ id: s.id, batchNo: s.batchNo, batchLabel: s.batchLabel, releaseState: s.releaseState, containerNo: s.containerNo }))
      .sort((a, b) => a.batchNo.localeCompare(b.batchNo)),
    taxInvoices: db.taxInvoices.filter((t) => t.piId === id).map((t) => ({ id: t.id, invoiceNo: t.invoiceNo, tax: centsToYuan(t.taxCents) })),
  };
}

export type OrderDetail = NonNullable<ReturnType<typeof getOrderDetail>>;

// ───────────────────────── 退税 ─────────────────────────

export type TaxRow = {
  id: string;
  declareMonth: string;
  batch: string;
  buyer: string;
  piNo: string | null;
  piId: string | null;
  sellerName: string;
  invoiceNo: string;
  item: string;
  qty: number;
  gross: number;
  net: number;
  tax: number;
  exportedOn: string | null;
  customsNo: string | null;
  customsUsd: number;
  entity: string | null;
};

export type TaxFilters = { q?: string; entity?: string; month?: string; buyer?: string; onlyUnlinked?: boolean };

export function listTaxInvoices(db: Database, f: TaxFilters = {}): TaxRow[] {
  const piById = new Map(db.pis.map((p) => [p.id, p]));
  const entityById = new Map(db.sellerEntities.map((e) => [e.id, e]));
  const q = f.q?.trim().toLowerCase();

  return db.taxInvoices
    .map((t): TaxRow => ({
      id: t.id,
      declareMonth: t.declareMonth,
      batch: t.batch,
      buyer: t.buyer,
      piNo: (t.piId ? piById.get(t.piId)?.piNo : null) ?? null,
      piId: t.piId,
      sellerName: t.sellerName,
      invoiceNo: t.invoiceNo,
      item: t.item,
      qty: t.qty,
      gross: centsToYuan(t.grossCents),
      net: centsToYuan(t.netCents),
      tax: centsToYuan(t.taxCents),
      exportedOn: t.exportedOn,
      customsNo: t.customsNo,
      customsUsd: centsToYuan(t.customsUsdCents),
      entity: (t.sellerEntityId ? entityById.get(t.sellerEntityId)?.name : null) ?? null,
    }))
    .filter((r) => {
      if (f.entity && r.entity !== f.entity) return false;
      if (f.month && r.declareMonth !== f.month) return false;
      if (f.buyer && r.buyer !== f.buyer) return false;
      if (f.onlyUnlinked && r.piId) return false;
      if (q) {
        const hay = `${r.invoiceNo} ${r.customsNo ?? ""} ${r.sellerName} ${r.item} ${r.piNo ?? ""} ${r.buyer}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.declareMonth.localeCompare(a.declareMonth) || a.invoiceNo.localeCompare(b.invoiceNo));
}

/**
 * KPI 随公司段联动，但金额走「该公司段全量」口径而不是当前筛选：
 * 申报月只决定「本月申报」这张卡，年度卡本来就该跨月累计。
 */
export function taxKpis(db: Database, entity?: string, month?: string) {
  const entityById = new Map(db.sellerEntities.map((e) => [e.id, e]));
  const scoped = db.taxInvoices.filter((t) => !entity || entityById.get(t.sellerEntityId ?? "")?.name === entity);
  const now = new Date();
  const year = now.getFullYear();
  const monthLabel = month || `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    year,
    yearTax: scoped.filter((t) => t.declareMonth.startsWith(String(year))).reduce((s, t) => s + centsToYuan(t.taxCents), 0),
    monthLabel,
    monthTax: scoped.filter((t) => t.declareMonth === monthLabel).reduce((s, t) => s + centsToYuan(t.taxCents), 0),
    lines: scoped.length,
    unlinked: scoped.filter((t) => !t.piId).length,
  };
}

export const listEntities = (db: Database) => db.sellerEntities.filter((e) => e.active).map((e) => e.name).sort();
export const listBuyers = (db: Database) => [...new Set(db.taxInvoices.map((t) => t.buyer))].sort();
export const listDeclareMonths = (db: Database) => [...new Set(db.taxInvoices.map((t) => t.declareMonth))].sort().reverse();
export const listSalesNames = (db: Database) => db.users.filter((u) => u.role === "sales" && u.active).map((u) => u.name).sort();

/** 关联向导的候选 PI：先按销售方/金额贴近度排，再按签约时间兜底 */
export function suggestPis(db: Database, invoiceId: string, q: string) {
  const inv = db.taxInvoices.find((t) => t.id === invoiceId);
  const customerById = new Map(db.customers.map((c) => [c.id, c]));
  const key = q.trim().toLowerCase();
  const usd = inv ? centsToYuan(inv.customsUsdCents) : 0;

  return db.pis
    .filter((p) => p.status !== "archived")
    .map((p) => {
      const cust = customerById.get(p.customerId);
      const amount = centsToYuan(p.amountCents);
      // 报关单美元额和 PI 金额越接近，越可能是同一票
      const closeness = usd > 0 && amount > 0 ? 1 - Math.min(1, Math.abs(amount - usd) / Math.max(amount, usd)) : 0;
      return {
        id: p.id,
        piNo: p.piNo,
        product: p.product,
        customerName: cust?.name ?? "—",
        signedOn: p.signedOn ?? "",
        amount,
        currency: p.currency,
        score: closeness,
      };
    })
    .filter((c) => !key || `${c.piNo} ${c.product ?? ""} ${c.customerName}`.toLowerCase().includes(key))
    .sort((a, b) => b.score - a.score || b.signedOn.localeCompare(a.signedOn))
    .slice(0, 30);
}

// ───────────────────────── 客户 ─────────────────────────

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  country: string;
  contact: string | null;
  creditLevel: string;
  limit: number;
  used: number;
  usedRatio: number;
  timezone: string | null;
  note: string | null;
  salesName: string;
  orderCount: number;
  orderAmount: number;
  lastOrderOn: string | null;
};

export function listCustomers(db: Database, viewer: Viewer, q?: string): CustomerRow[] {
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const key = q?.trim().toLowerCase();
  const stats = new Map<string, { n: number; amount: number; last: string }>();
  for (const p of db.pis) {
    if (p.status === "archived") continue;
    const cur = stats.get(p.customerId) ?? { n: 0, amount: 0, last: "" };
    cur.n += 1;
    cur.amount += centsToYuan(p.amountCents);
    if ((p.signedOn ?? "") > cur.last) cur.last = p.signedOn ?? "";
    stats.set(p.customerId, cur);
  }

  return db.customers
    .filter((c) => c.active)
    .filter((c) => inScope(viewer, c.salesId, userById.get(c.salesId ?? "")?.team ?? null))
    .map((c): CustomerRow => {
      const limit = centsToYuan(c.sinosureLimitCents);
      const used = centsToYuan(c.sinosureUsedCents);
      const st = stats.get(c.id);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        country: c.country,
        contact: c.contact,
        creditLevel: c.creditLevel,
        limit,
        used,
        usedRatio: limit > 0 ? used / limit : 0,
        timezone: c.timezone,
        note: c.note,
        salesName: (c.salesId ? userById.get(c.salesId)?.name : null) ?? "—",
        orderCount: st?.n ?? 0,
        orderAmount: st?.amount ?? 0,
        lastOrderOn: st?.last || null,
      };
    })
    .filter((c) => !key || `${c.code} ${c.name} ${c.country} ${c.contact ?? ""} ${c.salesName}`.toLowerCase().includes(key))
    .sort((a, b) => b.orderAmount - a.orderAmount);
}

// ───────────────────────── 看板 ─────────────────────────

export type Risk = { tone: "coral" | "amber" | "accent"; title: string; detail: string; href: string; action: string };

export function dashboardData(db: Database, viewer: Viewer) {
  const now = new Date();
  const year = now.getFullYear();
  const rate = customRate(db);
  const today = isoDate(now);

  const shipments = listShipments(db, viewer, {});
  const orders = listOrders(db, viewer, {});
  const customers = listCustomers(db, viewer);
  const taxRows = db.taxInvoices;

  const usdOf = (r: OrderRow) => (r.currency === "CNY" ? r.amount / rate : r.amount);
  const totalUsd = orders.reduce((s, r) => s + usdOf(r), 0);
  const warn = orders.filter((r) => r.profitRate < PROFIT_WARN_PCT).length;
  const loss = orders.filter((r) => r.profitRate < 0).length;

  const stalled = shipments.filter((s) => s.stalledDays > 0);
  const overdue = shipments.filter((s) => s.hasLate);
  const troubled = new Set([...stalled, ...overdue].map((s) => s.id));

  const monthPrefix = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const shippedThisMonth = shipments.filter((s) => s.atdDate?.startsWith(monthPrefix)).length;

  const yearTax = taxRows.filter((t) => t.declareMonth.startsWith(String(year))).reduce((s, t) => s + centsToYuan(t.taxCents), 0);
  const unlinkedTax = taxRows.filter((t) => !t.piId).length;

  // ---- 近 8 个月的出运与订单额 ----
  const monthly = Array.from({ length: 8 }, (_, i) => {
    const dt = new Date(year, now.getMonth() - 7 + i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: tr("{m}月", { m: dt.getMonth() + 1 }),
      key,
      count: shipments.filter((s) => s.atdDate?.startsWith(key)).length,
      amount: orders.filter((o) => o.signedOn.startsWith(key)).reduce((s, o) => s + usdOf(o), 0),
    };
  });

  // ---- 目的国 TOP ----
  const byCountry = new Map<string, number>();
  for (const o of orders) byCountry.set(o.destination, (byCountry.get(o.destination) ?? 0) + usdOf(o));
  const countries = [...byCountry.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);

  // ---- 业务员业绩 ----
  const bySales = new Map<string, { amount: number; rateSum: number; n: number }>();
  for (const o of orders) {
    const cur = bySales.get(o.salesName) ?? { amount: 0, rateSum: 0, n: 0 };
    cur.amount += usdOf(o);
    cur.rateSum += o.profitRate;
    cur.n += 1;
    bySales.set(o.salesName, cur);
  }
  const leaderboard = [...bySales.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, rate: v.n ? v.rateSum / v.n : 0, orders: v.n }))
    .sort((a, b) => b.amount - a.amount);

  // ---- 利润率分布 ----
  const buckets = [
    { label: "<0", tone: "coral" as const, test: (r: number) => r < 0 },
    { label: "0–11%", tone: "amber" as const, test: (r: number) => r >= 0 && r < 11 },
    { label: "11–18%", tone: "accent" as const, test: (r: number) => r >= 11 && r < 18 },
    { label: "18–25%", tone: "jade" as const, test: (r: number) => r >= 18 && r < 25 },
    { label: ">25%", tone: "jade" as const, test: (r: number) => r >= 25 },
  ].map((b) => ({ label: b.label, tone: b.tone, count: orders.filter((o) => b.test(o.profitRate)).length }));

  // ---- 今天要处理什么 ----
  const risks: Risk[] = [];
  if (stalled.length) {
    const worst = [...stalled].sort((a, b) => b.stalledDays - a.stalledDays)[0];
    risks.push({
      tone: "coral",
      title: tr("{n} 个批次停滞超过 {d} 天", { n: stalled.length, d: STALL_DAYS }),
      detail: tr("{no} 已停滞 {d} 天，最久没有新动态", { no: worst.batchNo, d: worst.stalledDays }),
      href: "/follow-ups?risk=1",
      action: tr("去跟单表处理"),
    });
  }
  if (loss) {
    const one = orders.find((o) => o.profitRate < 0);
    risks.push({
      tone: "coral",
      title: tr("{n} 单预估为负毛利", { n: loss }),
      detail: one ? tr("{no} 利润率 {p}%，成本已超报价", { no: one.piNo, p: one.profitRate.toFixed(2) }) : tr("需财务复核"),
      href: "/orders?risk=1",
      action: tr("去核算复核"),
    });
  }
  if (overdue.length) {
    risks.push({
      tone: "coral",
      title: tr("{n} 个批次里程碑超期", { n: overdue.length }),
      detail: tr("计划日已过但还没确认实际发生，需要跟货代确认"),
      href: "/follow-ups?risk=1",
      action: tr("去确认节点"),
    });
  }
  if (unlinkedTax) {
    risks.push({
      tone: "amber",
      title: tr("{n} 行退税发票未关联订单", { n: unlinkedTax }),
      detail: tr("影响本期退税申报进度"),
      href: "/tax-refund?unlinked=1",
      action: tr("去关联订单"),
    });
  }
  if (warn - loss > 0) {
    risks.push({
      tone: "amber",
      title: tr("{n} 单利润率低于 {p}%", { n: warn - loss, p: PROFIT_WARN_PCT }),
      detail: tr("已自动进入财务复核队列"),
      href: "/orders?risk=1",
      action: tr("查看预警单"),
    });
  }
  const overLimit = customers.filter((c) => c.limit > 0 && c.usedRatio > SINOSURE_WARN);
  if (overLimit.length) {
    risks.push({
      tone: "amber",
      title: tr("{n} 家客户中信保额度占用超 {p}%", { n: overLimit.length, p: Math.round(SINOSURE_WARN * 100) }),
      detail: tr("{name} 额度接近上限，再下单前需先回款", { name: overLimit[0].name }),
      href: "/customers",
      action: tr("查看额度"),
    });
  }
  const todo = shipments.filter((s) => s.hasTodo).length;
  if (todo) {
    risks.push({
      tone: "accent",
      title: tr("{n} 个批次有未完成待办", { n: todo }),
      detail: tr("在跟单表里标了待办，还没销掉"),
      href: "/follow-ups?todo=1",
      action: tr("去销待办"),
    });
  }

  return {
    kpi: {
      totalUsd,
      orders: orders.length,
      shippedThisMonth,
      inTransit: shipments.filter((s) => s.atdDate && s.milestones.some((m) => m.kind === "ETA" && m.state !== "done")).length,
      warn,
      loss,
      troubled: troubled.size,
      stalledMax: stalled.length ? Math.max(...stalled.map((s) => s.stalledDays)) : 0,
      yearTax,
      year,
      avgRate: orders.length ? orders.reduce((s, o) => s + o.profitRate, 0) / orders.length : 0,
    },
    monthly,
    countries,
    leaderboard,
    buckets,
    risks,
    /** 本周要出的货：按计划节点排的一条时间线 */
    upcoming: shipments
      .filter((s) => s.nextDate && daysBetween(s.nextDate, today) >= -2 && daysBetween(s.nextDate, today) <= 10)
      .sort((a, b) => (a.nextDate ?? "").localeCompare(b.nextDate ?? ""))
      .slice(0, 8),
    asOf: today,
  };
}

export type DashboardData = ReturnType<typeof dashboardData>;

// ───────────────────────── 审计 ─────────────────────────

export function listAudit(db: Database, f: { q?: string; entity?: string; actor?: string } = {}) {
  const q = f.q?.trim().toLowerCase();
  return db.auditLogs
    .filter((a) => {
      if (f.entity && a.entity !== f.entity) return false;
      if (f.actor && a.actorName !== f.actor) return false;
      if (q && !`${a.entityLabel} ${a.action} ${a.actorName} ${a.entity}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .slice(0, 400);
}

/** ⌘K 全局搜索：跨模块找单据，不是只搜当前页 */
export type SpotlightHit = { kind: string; label: string; sub: string; href: string };

export function spotlightSearch(db: Database, viewer: Viewer, q: string, limit = 8): SpotlightHit[] {
  const key = q.trim().toLowerCase();
  if (key.length < 1) return [];
  const hits: SpotlightHit[] = [];

  for (const s of db.shipments) {
    if (hits.length >= limit * 3) break;
    if (s.archived || !inScope(viewer, s.salesId, s.team)) continue;
    if (`${s.batchNo} ${s.containerNo ?? ""} ${s.country}`.toLowerCase().includes(key)) {
      hits.push({ kind: tr("出运批次"), label: s.batchNo, sub: `${s.country} · ${s.containerNo ?? tr("待订舱")}`, href: `/follow-ups?id=${s.id}` });
    }
  }
  for (const p of db.pis) {
    if (hits.length >= limit * 3) break;
    const cust = db.customers.find((c) => c.id === p.customerId);
    if (`${p.piNo} ${p.product ?? ""} ${cust?.name ?? ""}`.toLowerCase().includes(key)) {
      hits.push({ kind: tr("订单 / PI"), label: p.piNo, sub: `${cust?.name ?? "—"} · ${p.product ?? "—"}`, href: `/orders?id=${p.id}` });
    }
  }
  for (const c of db.customers) {
    if (hits.length >= limit * 3) break;
    if (`${c.code} ${c.name} ${c.country}`.toLowerCase().includes(key)) {
      hits.push({ kind: tr("客户"), label: c.name, sub: `${c.code} · ${c.country}`, href: `/customers?id=${c.id}` });
    }
  }
  for (const t of db.taxInvoices) {
    if (hits.length >= limit * 3) break;
    if (`${t.invoiceNo} ${t.customsNo ?? ""}`.toLowerCase().includes(key)) {
      hits.push({ kind: tr("退税发票"), label: t.invoiceNo, sub: `${t.sellerName}`, href: `/tax-refund?q=${t.invoiceNo}` });
    }
  }
  return hits.slice(0, limit * 2);
}

export function viewerOf(u: User | null): Viewer {
  if (!u) return { id: null, name: "访客", role: "viewer", scope: "all", team: null };
  return { id: u.id, name: u.name, role: u.role, scope: u.scope, team: u.team };
}

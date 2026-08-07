/**
 * 采购协同与资金侧的查询。跟 queries.ts 一样是对内存账套的同步纯函数。
 */

import { centsToYuan, daysBetween, isoDate } from "@/lib/format";
import type { Database } from "./types";

const today = () => isoDate(new Date());

// ───────────── 供应商 ─────────────

export type SupplierRow = {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  category: string;
  contact: string | null;
  phone: string | null;
  province: string;
  termDays: number;
  score: number;
  certExpiry: string | null;
  /** 资质还有几天到期，负数=已过期，null=没填 */
  certDays: number | null;
  taxNo: string | null;
  bank: string | null;
  note: string | null;
  /** 在手合同数与金额 */
  contracts: number;
  amount: number;
  /** 未付余额 */
  unpaid: number;
  /** 准时交付率，% */
  onTimeRate: number;
};

export function listSuppliers(db: Database, q?: string): SupplierRow[] {
  const t = today();
  const key = q?.trim().toLowerCase();
  return db.ops.suppliers
    .map((s): SupplierRow => {
      const cs = db.ops.contracts.filter((c) => c.supplierId === s.id);
      const pos = db.ops.productions.filter((p) => p.supplierId === s.id);
      const finished = pos.filter((p) => p.status === "done");
      return {
        ...s,
        certDays: s.certExpiry ? daysBetween(s.certExpiry, t) : null,
        contracts: cs.length,
        amount: cs.reduce((a, c) => a + centsToYuan(c.amountCents), 0),
        unpaid: cs.reduce((a, c) => a + centsToYuan(c.amountCents - c.paidCents), 0),
        onTimeRate: finished.length
          ? Math.round((finished.filter((p) => (p.qcOn ?? p.dueOn) <= p.dueOn).length / finished.length) * 100)
          : 100,
      };
    })
    .filter((s) => !key || `${s.code} ${s.name} ${s.nameEn ?? ""} ${s.category} ${s.contact ?? ""} ${s.province}`.toLowerCase().includes(key))
    .sort((a, b) => b.amount - a.amount);
}

// ───────────── 产品 ─────────────

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  nameEn?: string;
  category: string;
  hsCode: string;
  refundRate: number;
  unit: string;
  lastCost: number;
  packQty: number;
  grossWeightG: number;
  volumeCm3: number;
  note: string | null;
  /** 在手采购数量与金额 */
  onOrderQty: number;
  onOrderAmount: number;
  /** 每 20 尺柜大约能装多少 —— 报价时最常被问的那个数 */
  perContainer: number;
};

/** 20 尺柜可用装载体积约 28 立方米 */
const CBM_20GP = 28_000_000;

export function listProducts(db: Database, q?: string, category?: string): ProductRow[] {
  const key = q?.trim().toLowerCase();
  return db.ops.products
    .map((p): ProductRow => {
      const cs = db.ops.contracts.filter((c) => c.productId === p.id && c.status !== "closed");
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        nameEn: p.nameEn,
        category: p.category,
        hsCode: p.hsCode,
        refundRate: p.refundRateBp / 100,
        unit: p.unit,
        lastCost: centsToYuan(p.lastCostCents),
        packQty: p.packQty,
        grossWeightG: p.grossWeightG,
        volumeCm3: p.volumeCm3,
        note: p.note,
        onOrderQty: cs.reduce((a, c) => a + c.qty, 0),
        onOrderAmount: cs.reduce((a, c) => a + centsToYuan(c.amountCents), 0),
        perContainer: p.volumeCm3 > 0 ? Math.floor(CBM_20GP / p.volumeCm3) * p.packQty : 0,
      };
    })
    .filter((p) => !category || p.category === category)
    .filter((p) => !key || `${p.sku} ${p.name} ${p.nameEn ?? ""} ${p.hsCode} ${p.category}`.toLowerCase().includes(key))
    .sort((a, b) => b.onOrderAmount - a.onOrderAmount);
}

export const productCategories = (db: Database) => [...new Set(db.ops.products.map((p) => p.category))].sort();

// ───────────── 询价 ─────────────

export type RfqRow = {
  id: string;
  rfqNo: string;
  productName: string;
  productSku: string;
  qty: number;
  unit: string;
  wantedBy: string | null;
  status: string;
  ownerName: string;
  createdAt: string;
  quoteCount: number;
  /** 最低价与最高价，用来显示比价区间 */
  lowest: number;
  highest: number;
  /** 中标供应商 */
  awardedTo: string | null;
  awardedPrice: number | null;
  /** 最低价与中标价的差，正数=为了交期/品质多花的钱 */
  premium: number | null;
};

export function listRfqs(db: Database, q?: string, status?: string): RfqRow[] {
  const productById = new Map(db.ops.products.map((p) => [p.id, p]));
  const supplierById = new Map(db.ops.suppliers.map((s) => [s.id, s]));
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const key = q?.trim().toLowerCase();

  return db.ops.rfqs
    .map((r): RfqRow => {
      const quotes = db.ops.rfqQuotes.filter((x) => x.rfqId === r.id);
      const prices = quotes.map((x) => centsToYuan(x.unitPriceCents));
      const awarded = quotes.find((x) => x.id === r.awardedQuoteId);
      const product = productById.get(r.productId);
      const lowest = prices.length ? Math.min(...prices) : 0;
      const awardedPrice = awarded ? centsToYuan(awarded.unitPriceCents) : null;
      return {
        id: r.id,
        rfqNo: r.rfqNo,
        productName: product?.name ?? "—",
        productSku: product?.sku ?? "—",
        qty: r.qty,
        unit: product?.unit ?? "",
        wantedBy: r.wantedBy,
        status: r.status,
        ownerName: (r.ownerId ? userById.get(r.ownerId)?.name : null) ?? "—",
        createdAt: r.createdAt,
        quoteCount: quotes.length,
        lowest,
        highest: prices.length ? Math.max(...prices) : 0,
        awardedTo: awarded ? (supplierById.get(awarded.supplierId)?.name ?? null) : null,
        awardedPrice,
        premium: awardedPrice !== null && lowest > 0 ? Math.round((awardedPrice - lowest) * r.qty * 100) / 100 : null,
      };
    })
    .filter((r) => !status || r.status === status)
    .filter((r) => !key || `${r.rfqNo} ${r.productName} ${r.productSku} ${r.awardedTo ?? ""}`.toLowerCase().includes(key))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRfqQuotes(db: Database, rfqId: string) {
  const supplierById = new Map(db.ops.suppliers.map((s) => [s.id, s]));
  const rfq = db.ops.rfqs.find((r) => r.id === rfqId);
  return db.ops.rfqQuotes
    .filter((q) => q.rfqId === rfqId)
    .map((q) => {
      const s = supplierById.get(q.supplierId);
      return {
        id: q.id,
        supplierId: q.supplierId,
        supplierName: s?.name ?? "—",
        score: s?.score ?? 0,
        termDays: s?.termDays ?? 0,
        unitPrice: centsToYuan(q.unitPriceCents),
        leadDays: q.leadDays,
        validUntil: q.validUntil,
        moq: q.moq,
        total: centsToYuan(q.unitPriceCents) * (rfq?.qty ?? 0),
        awarded: q.id === rfq?.awardedQuoteId,
      };
    })
    .sort((a, b) => a.unitPrice - b.unitPrice);
}

// ───────────── 采购合同 ─────────────

export type ContractRow = {
  id: string;
  contractNo: string;
  supplierName: string;
  supplierId: string;
  piNo: string | null;
  piId: string | null;
  productName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  paid: number;
  unpaid: number;
  paidRatio: number;
  signedOn: string;
  deliveryBy: string | null;
  terms: string;
  status: string;
  /** 距离交货还有几天，负数=已过期 */
  daysToDelivery: number | null;
};

export function listContracts(db: Database, f: { q?: string; status?: string; supplier?: string } = {}): ContractRow[] {
  const t = today();
  const supplierById = new Map(db.ops.suppliers.map((s) => [s.id, s]));
  const productById = new Map(db.ops.products.map((p) => [p.id, p]));
  const piById = new Map(db.pis.map((p) => [p.id, p]));
  const key = f.q?.trim().toLowerCase();

  return db.ops.contracts
    .map((c): ContractRow => {
      const amount = centsToYuan(c.amountCents);
      const paid = centsToYuan(c.paidCents);
      const product = productById.get(c.productId);
      return {
        id: c.id,
        contractNo: c.contractNo,
        supplierName: supplierById.get(c.supplierId)?.name ?? "—",
        supplierId: c.supplierId,
        piNo: (c.piId ? piById.get(c.piId)?.piNo : null) ?? null,
        piId: c.piId,
        productName: product?.name ?? "—",
        qty: c.qty,
        unit: product?.unit ?? "",
        unitPrice: centsToYuan(c.unitPriceCents),
        amount,
        paid,
        unpaid: amount - paid,
        paidRatio: amount > 0 ? paid / amount : 0,
        signedOn: c.signedOn,
        deliveryBy: c.deliveryBy,
        terms: c.terms,
        status: c.status,
        daysToDelivery: c.deliveryBy ? daysBetween(c.deliveryBy, t) : null,
      };
    })
    .filter((c) => !f.status || c.status === f.status)
    .filter((c) => !f.supplier || c.supplierName === f.supplier)
    .filter((c) => !key || `${c.contractNo} ${c.supplierName} ${c.productName} ${c.piNo ?? ""}`.toLowerCase().includes(key))
    .sort((a, b) => b.signedOn.localeCompare(a.signedOn));
}

// ───────────── 生产单 ─────────────

export type ProductionRow = {
  id: string;
  orderNo: string;
  supplierName: string;
  productName: string;
  piNo: string | null;
  qty: number;
  doneQty: number;
  progress: number;
  unit: string;
  startOn: string | null;
  dueOn: string;
  status: string;
  qcResult: string | null;
  note: string | null;
  /** 距离交期还有几天，负数=已超期 */
  daysLeft: number;
  /** 已超期且没完工 */
  late: boolean;
};

export function listProductions(db: Database, f: { q?: string; status?: string } = {}): ProductionRow[] {
  const t = today();
  const supplierById = new Map(db.ops.suppliers.map((s) => [s.id, s]));
  const productById = new Map(db.ops.products.map((p) => [p.id, p]));
  const piById = new Map(db.pis.map((p) => [p.id, p]));
  const key = f.q?.trim().toLowerCase();

  return db.ops.productions
    .map((p): ProductionRow => {
      const daysLeft = daysBetween(p.dueOn, t);
      const product = productById.get(p.productId);
      return {
        id: p.id,
        orderNo: p.orderNo,
        supplierName: supplierById.get(p.supplierId)?.name ?? "—",
        productName: product?.name ?? "—",
        piNo: (p.piId ? piById.get(p.piId)?.piNo : null) ?? null,
        qty: p.qty,
        doneQty: p.doneQty,
        progress: p.qty > 0 ? p.doneQty / p.qty : 0,
        unit: product?.unit ?? "",
        startOn: p.startOn,
        dueOn: p.dueOn,
        status: p.status,
        qcResult: p.qcResult,
        note: p.note,
        daysLeft,
        late: daysLeft < 0 && p.status !== "done",
      };
    })
    .filter((p) => !f.status || p.status === f.status)
    .filter((p) => !key || `${p.orderNo} ${p.supplierName} ${p.productName} ${p.piNo ?? ""}`.toLowerCase().includes(key))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

// ───────────── 收付款 ─────────────

export type PaymentRow = {
  id: string;
  paymentNo: string;
  direction: "in" | "out";
  counterparty: string;
  piNo: string | null;
  contractNo: string | null;
  currency: string;
  amount: number;
  cny: number;
  paidOn: string;
  accountName: string;
  status: string;
  voucherNo: string | null;
};

export function listPayments(db: Database, f: { q?: string; direction?: string; status?: string } = {}): PaymentRow[] {
  const piById = new Map(db.pis.map((p) => [p.id, p]));
  const contractById = new Map(db.ops.contracts.map((c) => [c.id, c]));
  const accountById = new Map(db.ops.accounts.map((a) => [a.id, a]));
  const key = f.q?.trim().toLowerCase();

  return db.ops.payments
    .map((p): PaymentRow => ({
      id: p.id,
      paymentNo: p.paymentNo,
      direction: p.direction,
      counterparty: p.counterparty,
      piNo: (p.piId ? piById.get(p.piId)?.piNo : null) ?? null,
      contractNo: (p.contractId ? contractById.get(p.contractId)?.contractNo : null) ?? null,
      currency: p.currency,
      amount: centsToYuan(p.amountCents),
      cny: centsToYuan(p.cnyCents),
      paidOn: p.paidOn,
      accountName: (p.accountId ? accountById.get(p.accountId)?.name : null) ?? "—",
      status: p.status,
      voucherNo: p.voucherNo,
    }))
    .filter((p) => !f.direction || p.direction === f.direction)
    .filter((p) => !f.status || p.status === f.status)
    .filter((p) => !key || `${p.paymentNo} ${p.counterparty} ${p.piNo ?? ""} ${p.contractNo ?? ""} ${p.voucherNo ?? ""}`.toLowerCase().includes(key))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

export function paymentKpis(rows: PaymentRow[]) {
  const ins = rows.filter((r) => r.direction === "in");
  const outs = rows.filter((r) => r.direction === "out");
  return {
    inCny: ins.reduce((s, r) => s + r.cny, 0),
    outCny: outs.reduce((s, r) => s + r.cny, 0),
    net: ins.reduce((s, r) => s + r.cny, 0) - outs.reduce((s, r) => s + r.cny, 0),
    pending: rows.filter((r) => r.status === "pending").length,
  };
}

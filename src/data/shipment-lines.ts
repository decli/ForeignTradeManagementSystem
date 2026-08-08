/**
 * 分批出运的明细与对账。
 *
 * ── 这里回答两个问题 ──
 * 1. 「第 4 批装了什么」→ 开这一批的商业发票和装箱单要用；
 * 2. 「这张 PI 出完了没有」→ 决定还能不能再排批次、要不要催工厂。
 *
 * 第 2 个问题比看上去麻烦：不能拿 `已出 === 订单量` 判断。
 * 生产和装柜凑不出整数，合同里写的是 "5% more or less at seller's option"，
 * 所以判定要落在**溢短装区间**里，否则每张单最后都挂着几十件的尾巴，
 * 永远显示"未出完"，跟单员就再也不看这个状态了。
 */

import { DEFAULT_MORE_OR_LESS_BP, lineCartons, type Database, type Pi, type PiLine, type Shipment, type ShipmentLine } from "./types";

/** 一条批次明细 + 从 PiLine 补齐的包装参数 */
export type ResolvedShipLine = {
  line: ShipmentLine;
  piLine: PiLine;
  qty: number;
  /** 实际箱数；没填就按每箱数量推算 */
  cartons: number;
  grossKg: number;
  cbm: number;
};

export const shipLinesOf = (db: Database, shipmentId: string) =>
  db.shipmentLines.filter((l) => l.shipmentId === shipmentId);

export function resolveShipLines(db: Database, shipmentId: string): ResolvedShipLine[] {
  const out: ResolvedShipLine[] = [];
  for (const line of shipLinesOf(db, shipmentId)) {
    const piLine = db.piLines.find((p) => p.id === line.piLineId);
    if (!piLine) continue; // PI 明细被删了，这条批次明细就是孤儿，不参与计算
    // 留空 = 按 PiLine 的包装参数推算，填了 = 以货代给的实际数为准
    const cartons = line.cartons ?? lineCartons({ qty: line.qty, packQty: piLine.packQty });
    const perCartonG = line.grossWeightG ?? piLine.grossWeightG;
    const perCartonCm3 = line.volumeCm3 ?? piLine.volumeCm3;
    out.push({
      line,
      piLine,
      qty: line.qty,
      cartons,
      grossKg: (cartons * perCartonG) / 1000,
      cbm: (cartons * perCartonCm3) / 1_000_000,
    });
  }
  return out.sort((a, b) => a.piLine.seq - b.piLine.seq);
}

/* ── 出运进度对账 ────────────────────────────────────────── */

export type LineProgress = {
  piLine: PiLine;
  /** 订单量 */
  ordered: number;
  /** 各批合计已出 */
  shipped: number;
  /** 还差多少。已经超装时为 0，不给负数 —— 负的"待出"没有意义 */
  remaining: number;
  /** 已出 / 订单量 */
  ratio: number;
  state: "none" | "partial" | "done" | "over";
};

/**
 * 判定一行出完没有。
 *
 * `done` 的下界是订单量打掉溢短装（少装到 95% 就算交付完成），
 * 上界是订单量加上溢短装。**超过上界才叫 `over`** —— 那是真的多装了，
 * 客户有权拒收超出部分，得让人看见。
 */
export function lineProgress(l: PiLine, shipped: number, moreOrLessBp: number): LineProgress {
  const ordered = l.qty;
  const tol = moreOrLessBp / 10_000;
  const lo = ordered * (1 - tol);
  const hi = ordered * (1 + tol);
  const state: LineProgress["state"] =
    shipped <= 0 ? "none" : shipped > hi ? "over" : shipped >= lo ? "done" : "partial";
  return {
    piLine: l,
    ordered,
    shipped,
    remaining: Math.max(0, ordered - shipped),
    ratio: ordered > 0 ? shipped / ordered : 0,
    state,
  };
}

/** 这张 PI 每一行出到什么程度了 */
export function piShipProgress(db: Database, pi: Pi): LineProgress[] {
  const tol = pi.moreOrLessBp ?? DEFAULT_MORE_OR_LESS_BP;
  const batchIds = new Set(db.shipments.filter((s) => s.piId === pi.id && !s.archived).map((s) => s.id));
  const shippedBy = new Map<string, number>();
  for (const sl of db.shipmentLines) {
    if (!batchIds.has(sl.shipmentId)) continue;
    shippedBy.set(sl.piLineId, (shippedBy.get(sl.piLineId) ?? 0) + sl.qty);
  }
  return db.piLines
    .filter((l) => l.piId === pi.id)
    .sort((a, b) => a.seq - b.seq)
    .map((l) => lineProgress(l, shippedBy.get(l.id) ?? 0, tol));
}

/** 整张 PI 的一句话进度。全部 done/over 才算出完 */
export function piShipSummary(db: Database, pi: Pi) {
  const rows = piShipProgress(db, pi);
  const ordered = rows.reduce((s, r) => s + r.ordered, 0);
  const shipped = rows.reduce((s, r) => s + r.shipped, 0);
  const batches = db.shipments.filter((s) => s.piId === pi.id && !s.archived).length;
  const hasLines = db.shipmentLines.some((sl) => db.shipments.some((s) => s.id === sl.shipmentId && s.piId === pi.id));
  return {
    rows,
    ordered,
    shipped,
    batches,
    ratio: ordered > 0 ? shipped / ordered : 0,
    allDone: rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "over"),
    anyOver: rows.some((r) => r.state === "over"),
    /** 一批都还没排 */
    notStarted: batches === 0,
    /**
     * 有批次，但一条明细都没登记。
     *
     * 这跟"还没出货"完全是两回事，界面上必须分开说。老账套升级上来就是
     * 这个状态 —— 迁移变不出批次里装了什么，只能如实承认不知道。
     * 混为一谈的话，跟单员会以为货还在厂里。
     */
    unlogged: batches > 0 && !hasLines,
  };
}

/**
 * 新建批次时的预填量：还没出的部分全给这一批。
 * 多数人就是这么装的（能装多少装多少），预填对了就不用逐行敲。
 */
export function suggestLines(db: Database, pi: Pi, shipmentId: string): ShipmentLine[] {
  return piShipProgress(db, pi)
    .filter((r) => r.remaining > 0)
    .map((r, i) => ({
      id: `shl_${shipmentId}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      shipmentId,
      piLineId: r.piLine.id,
      qty: r.remaining,
      cartons: null,
      grossWeightG: null,
      volumeCm3: null,
    }));
}

/**
 * 本批的发票号。
 *
 * 没单独填就从批次号派生 —— 批次号本来就带着「第几批」的信息
 * （MT26X04118-4），拿它当发票号，客户对账时一眼能对上是哪一票货。
 */
export const batchInvoiceNo = (s: Shipment) => s.invoiceNo || s.batchNo;

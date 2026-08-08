/**
 * 报价核算。
 *
 * 外贸业务员每天最高频的动作就是这一步：客户问 CIF 鹿特丹多少钱，
 * 你要在采购价、海运费、保费、银行费、退税之间算出一个既能成交又不亏的数。
 * 大多数人用 Excel 算，每个人一张自己的表，口径互相对不上。
 *
 * ── 两个方向 ──
 * 正算：给定报价 → 算出这单赚多少、利润率几个点。
 * 反算：给定目标利润率 → 倒推该报多少。谈判现场用的是这个方向。
 *
 * ── 退税这一段是整个模型里最容易算错的 ──
 * 常见的错法是「退税 = 采购额 × 退税率」。实际税则是：
 *
 *     退税额 = 含税采购额 ÷ (1 + 征税率) × 退税率
 *
 * 征税率 13%、退税率 13% 时，实际退回的是采购额的 11.50%，不是 13%。
 * 一单 100 万人民币的采购，两种算法差 1.5 万 —— 报价上差 1.5 个点，
 * 足以把一单本来能赚的生意报成亏的，或者反过来。
 *
 * ── 保费的循环依赖 ──
 * CIF 惯例按货值的 110% 投保，而"货值"就是 CIF 报价本身 ——
 * 保费依赖报价，报价又要含保费。反算时用闭式解拆开（见 solveRevenue），
 * 不用迭代逼近：迭代在利润率接近 100% 时不收敛，而用户真的会手滑输 99%。
 */

import type { Incoterm, QuoteCalcInput, QuoteLine } from "@/data/presales-types";
import { findIncoterm } from "@/data/presales-types";

/** 出口货物的增值税征税率。退税计算的分母，不是退税率 */
export const VAT_RATE_BP = 1300;

/** 保险投保比例：货值的 110%，这是 CIF 的国际惯例（Incoterms 规定的最低值） */
export const INSURE_RATIO = 1.1;

export type CalcLine = Pick<QuoteLine, "qty" | "unitPriceE4" | "costE4" | "refundRateBp">;

export type QuoteCalcResult = {
  /** 报价总额，报价币种，分 */
  revenueCents: number;
  /** 报价总额折人民币，分 */
  revenueCnyCents: number;
  /** 含税采购额，人民币分 */
  purchaseCents: number;
  /** 出口退税，人民币分 */
  refundCents: number;
  freightCents: number;
  insuranceCents: number;
  localCents: number;
  bankCents: number;
  destCents: number;
  /** 全部成本（不含退税），人民币分 */
  totalCostCents: number;
  /** 利润，人民币分。计不计退税看 calc.refundCounted */
  profitCents: number;
  /** 利润率，基点。分母是销售收入 */
  marginBp: number;
  /** 保本总价（利润为 0），报价币种，分 */
  breakEvenCents: number;
};

const rateOf = (c: QuoteCalcInput) => c.rateE6 / 1_000_000;

/** 一行的含税采购额，人民币分 */
export const linePurchaseCents = (l: CalcLine) => Math.round((l.qty * l.costE4) / 100);

/** 一行的报价金额，报价币种分 */
export const lineRevenueCents = (l: CalcLine) => Math.round((l.qty * l.unitPriceE4) / 100);

/**
 * 一行能退多少税，人民币分。
 * 退税跟着**采购**走，不跟着售价走 —— 退的是上游已经缴过的进项税。
 */
export function lineRefundCents(l: CalcLine) {
  const purchase = linePurchaseCents(l);
  return Math.round((purchase / (1 + VAT_RATE_BP / 10_000)) * (l.refundRateBp / 10_000));
}

/** 这个贸易术语下，哪些费用由我方承担 */
export function scopeOf(incoterm: Incoterm) {
  const t = findIncoterm(incoterm);
  return {
    freight: t.freight,
    insurance: t.insurance,
    dest: t.destCharge,
    /* EXW 是工厂交货：拖车、报关、港杂全部由客户承担。
       其余术语从 FOB 起，出口国内这一段都是我方的事。 */
    local: incoterm !== "EXW",
  };
}

/**
 * 正算：给定明细行和参数，算出这单的账。
 */
export function calcQuote(lines: CalcLine[], calc: QuoteCalcInput, incoterm: Incoterm): QuoteCalcResult {
  const scope = scopeOf(incoterm);
  const rate = rateOf(calc);

  const revenueCents = lines.reduce((s, l) => s + lineRevenueCents(l), 0);
  const revenueCnyCents = Math.round(revenueCents * rate);
  const purchaseCents = lines.reduce((s, l) => s + linePurchaseCents(l), 0);
  const refundRaw = lines.reduce((s, l) => s + lineRefundCents(l), 0);
  const refundCents = calc.refundCounted ? refundRaw : 0;

  const freightCents = scope.freight ? calc.freightCents : 0;
  const localCents = scope.local ? calc.localCents : 0;
  const destCents = scope.dest ? calc.destCents : 0;
  // 保费按报价货值的 110% 计，跟着收入走
  const insuranceCents = scope.insurance
    ? Math.round(revenueCnyCents * INSURE_RATIO * (calc.insuranceRateBp / 10_000))
    : 0;
  const bankCents = Math.round(revenueCnyCents * (calc.bankRateBp / 10_000));

  const totalCostCents = purchaseCents + freightCents + insuranceCents + localCents + bankCents + destCents;
  const profitCents = revenueCnyCents + refundCents - totalCostCents;
  const marginBp = revenueCnyCents > 0 ? Math.round((profitCents / revenueCnyCents) * 10_000) : 0;

  return {
    revenueCents,
    revenueCnyCents,
    purchaseCents,
    refundCents,
    freightCents,
    insuranceCents,
    localCents,
    bankCents,
    destCents,
    totalCostCents,
    profitCents,
    marginBp,
    breakEvenCents: solveRevenue(lines, calc, incoterm, 0),
  };
}

/**
 * 反算：要达到目标利润率，总报价该是多少（报价币种，分）。
 *
 * 设收入（人民币）为 R，那些不随报价变的成本为 F（采购 + 运费 + 国内 + 目的港），
 * 退税为 T，银行费率 b，保险实际费率 s（= 110% × 保险费率）：
 *
 *     R + T − F − R·b − R·s = m · R
 *   ⟹ R · (1 − b − s − m) = F − T
 *   ⟹ R = (F − T) / (1 − b − s − m)
 *
 * 分母 ≤ 0 说明目标利润率高到不可能达到（比如输了 99%），
 * 这时返回 0，界面上显示「这个目标做不到」而不是一个荒谬的天价。
 */
export function solveRevenue(lines: CalcLine[], calc: QuoteCalcInput, incoterm: Incoterm, targetMarginBp: number) {
  const scope = scopeOf(incoterm);
  const rate = rateOf(calc);
  if (rate <= 0) return 0;

  const purchase = lines.reduce((s, l) => s + linePurchaseCents(l), 0);
  const refund = calc.refundCounted ? lines.reduce((s, l) => s + lineRefundCents(l), 0) : 0;
  const fixed = purchase + (scope.freight ? calc.freightCents : 0) + (scope.local ? calc.localCents : 0) + (scope.dest ? calc.destCents : 0);

  const b = calc.bankRateBp / 10_000;
  const s = scope.insurance ? (calc.insuranceRateBp / 10_000) * INSURE_RATIO : 0;
  const m = targetMarginBp / 10_000;

  const denom = 1 - b - s - m;
  if (denom <= 0.0001) return 0;

  const revenueCny = (fixed - refund) / denom;
  return Math.max(0, Math.round(revenueCny / rate));
}

/**
 * 把目标总价摊回每一行的单价。
 *
 * 按各行**当前金额的占比**等比缩放，而不是平均分 —— 平均分会把
 * 一行 60 万的摄像机和一行 3 千的棉签调到同一个涨幅，报价单立刻不能看。
 * 等比缩放保持原来的价格结构，业务员只需要复核一个总数。
 */
export function scaleToTarget(lines: CalcLine[], targetRevenueCents: number): number[] {
  const current = lines.reduce((s, l) => s + lineRevenueCents(l), 0);
  if (current <= 0 || targetRevenueCents <= 0) return lines.map((l) => l.unitPriceE4);
  const k = targetRevenueCents / current;
  return lines.map((l) => Math.max(1, Math.round(l.unitPriceE4 * k)));
}

/** 核算参数的出厂默认值。数字是照真实外贸口径给的，不是随手填的 */
export const defaultCalc = (rateE6: number): QuoteCalcInput => ({
  rateE6,
  freightCents: 0,
  /** 一切险费率，千分之三上下是市场价 */
  insuranceRateBp: 30,
  localCents: 0,
  /** 电汇 + 交单，占货值千分之十一 */
  bankRateBp: 110,
  destCents: 0,
  targetMarginBp: 1800,
  refundCounted: true,
});

/**
 * 单位换算：报价单上还要给客户一个「每箱多少钱」或「每公斤多少钱」的口径。
 * 这里只算箱数和体积重，具体展示在报价单页面上。
 */
export function packSummary(lines: Array<{ qty: number; packQty: number; grossWeightG: number; volumeCm3: number }>) {
  let cartons = 0;
  let grossG = 0;
  let volCm3 = 0;
  for (const l of lines) {
    const c = l.packQty > 0 ? Math.ceil(l.qty / l.packQty) : 0;
    cartons += c;
    grossG += c * l.grossWeightG;
    volCm3 += c * l.volumeCm3;
  }
  return {
    cartons,
    grossKg: grossG / 1000,
    cbm: volCm3 / 1_000_000,
    /* 20GP 装 28 立方是行业惯用的可装载体积（柜内 33 立方，实际装载率约 85%）。
       报价时要知道这单是不是刚好差一点凑不满一个柜 —— 差一点最贵。 */
    teu: volCm3 / 1_000_000 / 28,
  };
}

/**
 * 结构化收款计划。
 *
 * ── 它替掉的是一句话 ──
 * 原来 PI 上的付款方式是自由文本：「30% T/T 定金，70% 见提单副本」。
 * 人读得懂，系统读不懂 —— 于是应收账龄只能拿客户级的一个 termDays
 * 从提单日一刀切，算出来的到期日对 70% 那部分勉强对，对 30% 的定金
 * 完全是错的（定金签约就该付，不是发货后 30 天）。
 *
 * 拆成分期之后：定金到没到、尾款该哪天催、能不能放货，全都有据可依。
 *
 * ── 这个文件里最重要的一条规则 ──
 * **触发事件没发生，就不要编造到期日。**
 * "见提单副本 30 天" 在开船之前没有到期日可言。给它算一个（比如从签约日
 * 起算）会污染账龄分桶、催收清单和现金流预测 —— 而这正是旧口径在做的事。
 * 宁可显示「待开船」，也不要给一个看起来很确定的假日期。
 */

import { daysSince, isoDate } from "@/lib/format";
import type { Database, Pi, PaymentTerm, PaymentTrigger } from "./types";

/** 触发事件的中文名。界面上直接用，不要再翻一层 */
export const TRIGGER_LABEL: Record<PaymentTrigger, string> = {
  signed: "签约后",
  bl_copy: "见提单副本",
  bl_original: "见正本提单",
  atd: "开船后",
  eta: "到港后",
  delivered: "签收后",
  fixed: "指定日期",
};

/** 事件还没发生时，界面上显示什么。说"等什么"，不说一个假日期 */
export const TRIGGER_PENDING: Record<PaymentTrigger, string> = {
  signed: "待签约",
  bl_copy: "待出提单",
  bl_original: "待出正本提单",
  atd: "待开船",
  eta: "待到港",
  delivered: "待签收",
  fixed: "未指定日期",
};

/**
 * 常用付款条件模板。
 * 一键套用比逐条敲快得多，而这几种覆盖了绝大多数单子。
 */
export const TERM_TEMPLATES: Array<{ name: string; terms: Array<Omit<PaymentTerm, "id" | "piId">> }> = [
  {
    name: "30% 定金 + 70% 见提单副本",
    terms: [
      { seq: 1, ratioBp: 3000, amountCents: null, trigger: "signed", offsetDays: 0, fixedOn: null, blocksRelease: false, note: "T/T 定金" },
      { seq: 2, ratioBp: 7000, amountCents: null, trigger: "bl_copy", offsetDays: 0, fixedOn: null, blocksRelease: true, note: "见提单副本电放" },
    ],
  },
  {
    name: "100% 前 T/T（款到发货）",
    terms: [{ seq: 1, ratioBp: 10000, amountCents: null, trigger: "signed", offsetDays: 0, fixedOn: null, blocksRelease: true, note: "款到才安排生产" }],
  },
  {
    name: "30% 定金 + 70% 见提单后 30 天",
    terms: [
      { seq: 1, ratioBp: 3000, amountCents: null, trigger: "signed", offsetDays: 0, fixedOn: null, blocksRelease: false, note: "T/T 定金" },
      { seq: 2, ratioBp: 7000, amountCents: null, trigger: "bl_copy", offsetDays: 30, fixedOn: null, blocksRelease: false, note: "账期 30 天" },
    ],
  },
  {
    name: "开船后 60 天（老客户放账）",
    terms: [{ seq: 1, ratioBp: 10000, amountCents: null, trigger: "atd", offsetDays: 60, fixedOn: null, blocksRelease: false, note: "全额放账" }],
  },
];

/* ── 事件日期解析 ────────────────────────────────────────── */

/**
 * 这张 PI 上某个触发事件到底发生了没有、哪天发生的。
 *
 * 多批出运时取**最早**那一批：账期从第一次实际发货起算，这是行业惯例，
 * 也跟旧口径保持一致。想按批分摊的另说，见 P0-3 设计里的「按批次分摊」。
 */
export function triggerDate(db: Database, pi: Pi, trigger: PaymentTrigger, fixedOn: string | null): string | null {
  if (trigger === "fixed") return fixedOn;
  if (trigger === "signed") return pi.signedOn;

  const shipments = db.shipments.filter((s) => s.piId === pi.id && !s.archived);
  const earliest = (kind: string) =>
    shipments
      .flatMap((s) => db.milestones.filter((m) => m.shipmentId === s.id && m.kind === kind && m.actualOn))
      .map((m) => m.actualOn as string)
      .sort()[0] ?? null;

  switch (trigger) {
    case "atd":
    // 提单副本实务上跟开船同步签发，正本晚几天 —— 这里都挂在 ATD 上
    case "bl_copy":
      return earliest("ATD");
    case "bl_original": {
      const atd = earliest("ATD");
      return atd ? addDays(atd, 3) : null;
    }
    case "eta":
      return earliest("ETA");
    case "delivered": {
      // 没有单独的签收节点，用 ETA 之后几天近似，并在界面上标明是估算
      const eta = earliest("ETA");
      return eta ? addDays(eta, 3) : null;
    }
    default:
      return null;
  }
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/* ── 一期的完整状态 ────────────────────────────────────────── */

export type TermState = {
  term: PaymentTerm;
  /** 这一期该收多少，分 */
  dueCents: number;
  /** 触发事件发生的日期。null = 还没发生 */
  startOn: string | null;
  /** 到期日。**事件没发生时是 null，绝不猜** */
  dueOn: string | null;
  /** 事件没发生时，告诉用户在等什么 */
  pending: string | null;
  /** 逾期天数。没有到期日就没有逾期一说 */
  overdue: number | null;
  blocksRelease: boolean;
};

/** 比例优先级：填了金额就用金额（尾款常带零头），否则按比例算 */
export function termAmount(pi: Pi, t: PaymentTerm) {
  if (t.amountCents != null) return t.amountCents;
  return Math.round((pi.amountCents * t.ratioBp) / 10_000);
}

export function resolveTerm(db: Database, pi: Pi, t: PaymentTerm, today = isoDate(new Date())): TermState {
  const startOn = triggerDate(db, pi, t.trigger, t.fixedOn);
  const dueOn = startOn ? addDays(startOn, t.offsetDays) : null;
  return {
    term: t,
    dueCents: termAmount(pi, t),
    startOn,
    dueOn,
    pending: startOn ? null : TRIGGER_PENDING[t.trigger],
    overdue: dueOn ? daysSince(dueOn, today) : null,
    blocksRelease: t.blocksRelease,
  };
}

export const termsOf = (db: Database, piId: string) =>
  db.paymentTerms.filter((t) => t.piId === piId).sort((a, b) => a.seq - b.seq);

export function resolveTerms(db: Database, pi: Pi, today = isoDate(new Date())) {
  return termsOf(db, pi.id).map((t) => resolveTerm(db, pi, t, today));
}

/**
 * 比例合计必须正好 10000bp。
 * 差一点点就意味着有一笔钱不在任何一期里 —— 那笔钱永远不会有人去催。
 */
export function ratioTotal(terms: PaymentTerm[]) {
  return terms.reduce((s, t) => s + (t.amountCents == null ? t.ratioBp : 0), 0);
}

/**
 * 放货闸口：还有没收的、且标了"不收不放"的期。
 * 这替掉了跟单表备注里手写的那句「待客户付尾款后电放」——
 * 那句话系统不认识，交接给同事就漏了。
 */
export function releaseBlockers(db: Database, pi: Pi, paidCents: number) {
  const states = resolveTerms(db, pi);
  let covered = paidCents;
  const unpaid: TermState[] = [];
  // 收款按期次顺序核销：先冲定金，再冲尾款
  for (const s of states) {
    if (covered >= s.dueCents) {
      covered -= s.dueCents;
      continue;
    }
    unpaid.push({ ...s, dueCents: s.dueCents - covered });
    covered = 0;
  }
  return unpaid.filter((s) => s.blocksRelease);
}

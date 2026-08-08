/**
 * 审批 / 通知 / 应收账龄 / 往来的查询。
 */

import { daysSince, isoDate } from "@/lib/format";
import type { Database } from "./types";
import { TRIGGER_LABEL, resolveTerms } from "./payment-terms";
import type { ApprovalRequest, Message } from "./flow-types";
import { APPROVAL_KINDS } from "./flow-types";
import type { Viewer } from "./queries";
import { inScope } from "./queries";

/* ═══════════════════ 审批 ═══════════════════ */

export type ApprovalRow = ApprovalRequest & {
  kindLabel: string;
  /** 现在轮到谁 */
  currentName: string | null;
  /** 我是不是当前这一步的审批人 */
  mine: boolean;
  /** 挂了多少小时没人处理 */
  waitHours: number;
};

export function listApprovals(db: Database, viewer: Viewer, f: { q?: string; status?: string; kind?: string; mine?: boolean } = {}): ApprovalRow[] {
  const now = Date.now();
  const key = f.q?.trim().toLowerCase();
  return db.flow.approvals
    .map((a): ApprovalRow => {
      const step = a.steps[a.cursor];
      return {
        ...a,
        kindLabel: APPROVAL_KINDS[a.kind]?.zh ?? a.kind,
        currentName: a.status === "pending" ? step?.approverName ?? null : null,
        mine: a.status === "pending" && step?.approverId === viewer.id,
        waitHours: (now - Date.parse(a.createdAt)) / 3_600_000,
      };
    })
    .filter((a) => !f.mine || a.mine)
    .filter((a) => !f.status || a.status === f.status)
    .filter((a) => !f.kind || a.kind === f.kind)
    .filter((a) => !key || `${a.requestNo} ${a.entityLabel} ${a.summary} ${a.requesterName} ${a.kindLabel}`.toLowerCase().includes(key))
    /* 待办排最前，其中挂得越久越靠前 —— 审批系统最怕的不是审得慢，
       是一张单在那儿挂了两周谁都没看见 */
    .sort((a, b) => {
      const p = (r: ApprovalRow) => (r.status === "pending" ? 0 : 1);
      return p(a) - p(b) || (p(a) === 0 ? b.waitHours - a.waitHours : b.createdAt.localeCompare(a.createdAt));
    });
}

export function approvalKpis(rows: ApprovalRow[], viewer: Viewer) {
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.closedAt);
  const hours = done.map((r) => (Date.parse(r.closedAt!) - Date.parse(r.createdAt)) / 3_600_000);
  return {
    mine: pending.filter((r) => r.mine).length,
    pending: pending.length,
    stuck: pending.filter((r) => r.waitHours > 48).length,
    avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0,
    byMe: rows.filter((r) => r.requesterId === viewer.id).length,
  };
}

/* ═══════════════════ 应收账龄 ═══════════════════ */

/**
 * 账龄分桶。名字就是老板嘴里那几个词，不要发明新说法。
 *
 * 「待触发」是新加的一档，专门装**触发事件还没发生**的期次：
 * 「见提单副本 30 天」在开船之前根本没有到期日。旧口径把这种也算进
 * 「未到期」，看着像"日子还早"，其实是"日子还不存在" —— 一个能催，
 * 一个只能等，混在一起老板就分不清哪些钱是真的在路上。
 */
export const AGING_BUCKETS = ["待触发", "未到期", "逾期 1–30 天", "逾期 31–60 天", "逾期 61–90 天", "逾期 90 天以上"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export type AgingRow = {
  id: string;
  piNo: string;
  customerId: string;
  customer: string;
  country: string;
  creditLevel: string;
  currency: string;
  salesName: string;
  /** 合同额，分 */
  amountCents: number;
  /** 已收，分 */
  paidCents: number;
  /** 未收，分 */
  openCents: number;
  /** 触发事件发生的日期。null = 事件还没发生 */
  startOn: string | null;
  termDays: number;
  /** 到期日。**事件没发生时是 null，不编** */
  dueOn: string | null;
  /** 逾期天数。没有到期日时是 0，配合 bucket="待触发" 一起看 */
  overdue: number;
  bucket: AgingBucket;
  /* ── 分期相关。没有收款计划的老单子退回整单口径，下面几项为 null ── */
  /** 第几期，如「1/2」。null = 整单口径 */
  termLabel: string | null;
  /** 在等什么事件，如「待开船」。null = 已经有到期日了 */
  pending: string | null;
  /** 起算事件的名字，如「见提单副本」。整单口径时是 null */
  triggerLabel: string | null;
  /** 这一期不收到就不放单 */
  blocksRelease: boolean;
  note: string | null;
};

const bucketOf = (overdue: number): AgingBucket =>
  overdue <= 0 ? "未到期" : overdue <= 30 ? "逾期 1–30 天" : overdue <= 60 ? "逾期 31–60 天" : overdue <= 90 ? "逾期 61–90 天" : "逾期 90 天以上";

/**
 * 应收账龄。
 *
 * ── 起算日为什么不是签约日 ──
 * 外贸的账期从**提单日**起算（"见提单副本 30 天"是标准写法），不是从签合同那天。
 * 一张 3 月签、6 月才出货的单子，按签约日算已经逾期两个月，
 * 按提单日算才刚开始计时 —— 差三个月，催收清单会完全不同。
 * 没有提单日的（还没出货）退回签约日，并且这种单子通常也不该出现在催收清单里。
 */
export function listAging(db: Database, viewer: Viewer, f: { q?: string; bucket?: string; sales?: string } = {}): AgingRow[] {
  const today = isoDate(new Date());
  const key = f.q?.trim().toLowerCase();
  const out: AgingRow[] = [];

  for (const pi of db.pis) {
    if (pi.status === "archived") continue;
    if (!inScope(viewer, pi.salesId, null)) continue;
    const cst = db.costings.find((c) => c.piId === pi.id);
    if (!cst) continue;
    const openCents = pi.amountCents - cst.receivableCents;
    if (openCents <= 0) continue;

    const cust = db.customers.find((c) => c.id === pi.customerId);
    const common = {
      piNo: pi.piNo,
      customerId: pi.customerId,
      customer: cust?.name ?? "—",
      country: cust?.country ?? pi.destination ?? "—",
      creditLevel: cust?.creditLevel ?? "B",
      currency: pi.currency,
      salesName: db.users.find((u) => u.id === pi.salesId)?.name ?? "—",
      amountCents: pi.amountCents,
      paidCents: cst.receivableCents,
    };

    const states = resolveTerms(db, pi, today);

    /* 没有收款计划的单子（老账套迁移上来、或还没配）退回整单口径 ——
       口径变了不等于数据就没了，宁可粗一点也不能让这些钱从催收清单里消失。 */
    if (states.length === 0) {
      const atds = db.shipments
        .filter((s) => s.piId === pi.id)
        .flatMap((s) => db.milestones.filter((m) => m.shipmentId === s.id && m.kind === "ATD" && m.actualOn))
        .map((m) => m.actualOn as string)
        .sort();
      const startOn = atds[0] ?? pi.signedOn ?? pi.createdAt.slice(0, 10);
      const termDays = cust?.termDays ?? 30;
      const dueOn = new Date(Date.parse(startOn) + termDays * 86_400_000).toISOString().slice(0, 10);
      const overdue = daysSince(dueOn, today);
      out.push({
        ...common,
        id: pi.id,
        openCents,
        startOn,
        termDays,
        dueOn,
        overdue,
        bucket: bucketOf(overdue),
        termLabel: null,
        pending: null,
        triggerLabel: null,
        blocksRelease: false,
        note: null,
      });
      continue;
    }

    /* 按期次顺序核销已收款：先冲定金，再冲尾款。
       已经收满的期不进清单 —— 催收清单上只该有还没收到的钱。 */
    let covered = cst.receivableCents;
    states.forEach((s, i) => {
      if (covered >= s.dueCents) {
        covered -= s.dueCents;
        return;
      }
      const openThis = s.dueCents - covered;
      covered = 0;
      out.push({
        ...common,
        // 一张 PI 会出现多行，id 必须带期次，否则表格 key 撞车
        id: `${pi.id}:${s.term.id}`,
        openCents: openThis,
        startOn: s.startOn,
        termDays: s.term.offsetDays,
        dueOn: s.dueOn,
        overdue: s.overdue ?? 0,
        // 事件没发生 = 没有到期日 = 不能算"未到期"，单列一档
        bucket: s.dueOn ? bucketOf(s.overdue ?? 0) : "待触发",
        termLabel: `${i + 1}/${states.length}`,
        pending: s.pending,
        triggerLabel: TRIGGER_LABEL[s.term.trigger],
        blocksRelease: s.blocksRelease,
        note: s.term.note,
      });
    });
  }

  return out
    .filter((r) => !f.bucket || r.bucket === f.bucket)
    .filter((r) => !f.sales || r.salesName === f.sales)
    .filter((r) => !key || `${r.piNo} ${r.customer} ${r.country} ${r.salesName}`.toLowerCase().includes(key))
    .sort((a, b) => b.overdue - a.overdue || b.openCents - a.openCents);
}

export function agingSummary(rows: AgingRow[]) {
  const buckets = AGING_BUCKETS.map((b) => {
    const hit = rows.filter((r) => r.bucket === b);
    return { bucket: b, n: hit.length, cents: hit.reduce((s, r) => s + r.openCents, 0) };
  });
  const total = rows.reduce((s, r) => s + r.openCents, 0);
  const overdue = rows.filter((r) => r.overdue > 0);
  return {
    buckets,
    total,
    overdueCents: overdue.reduce((s, r) => s + r.openCents, 0),
    overdueCount: overdue.length,
    /* 加权平均逾期天数（DSO 的近似）。按金额加权而不是按单数 ——
       十张小单逾期 5 天，和一张大单逾期 90 天，风险完全不是一回事 */
    weightedDays: total > 0 ? rows.reduce((s, r) => s + Math.max(0, r.overdue) * r.openCents, 0) / total : 0,
  };
}

/** 按客户汇总。催收是按客户打电话的，不是按单据 */
export function agingByCustomer(rows: AgingRow[]) {
  const map = new Map<string, { customer: string; country: string; creditLevel: string; n: number; cents: number; worst: number; sales: string }>();
  for (const r of rows) {
    const cur = map.get(r.customerId) ?? { customer: r.customer, country: r.country, creditLevel: r.creditLevel, n: 0, cents: 0, worst: -9999, sales: r.salesName };
    cur.n++;
    cur.cents += r.openCents;
    cur.worst = Math.max(cur.worst, r.overdue);
    map.set(r.customerId, cur);
  }
  return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.worst - a.worst || b.cents - a.cents);
}

/* ═══════════════════ 通知 ═══════════════════ */

export type NoticeRow = { id: string; kind: string; title: string; body: string; href: string | null; read: boolean; at: string; derived: boolean };

/**
 * 我的通知。
 *
 * 两个来源合流：
 *  · **事件型** —— 落库的（审批到你了、单子分给你了），发生过就是发生过；
 *  · **派生型** —— 由 lib/notify.ts 从当前数据实时算出来的（某单超期、某客户额度快满）。
 *    单子改好了它自己就消失，不需要谁去手工关掉 —— 这是它比"生成一条通知记录"
 *    强的地方：一个已经处理完却还挂在那里的红点，比没有红点更糟。
 */
/**
 * 这里**不截断**。
 *
 * 原来结尾是 `.slice(0, 40)`，而铃铛上那个数是从返回值里数出来的 ——
 * 于是攒到第 41 条以后，红点会停在 40 不动，跟真实待办数悄悄脱钩。
 * 一个会撒谎的红点比没有红点更糟。
 * 要不要少画几行是**渲染**的事，交给调用方；计数必须拿全量算。
 */
export function listNotices(db: Database, viewer: Viewer, derived: NoticeRow[]): NoticeRow[] {
  const stored = db.flow.notifications
    .filter((n) => n.userId === null || n.userId === viewer.id)
    .map((n): NoticeRow => ({ ...n, derived: false }));
  return [...stored, ...derived].sort((a, b) => b.at.localeCompare(a.at));
}

/* ═══════════════════ 往来沟通 ═══════════════════ */

export function listMessages(db: Database, f: { customerId?: string; entity?: string; entityId?: string; q?: string } = {}): Message[] {
  const key = f.q?.trim().toLowerCase();
  return db.flow.messages
    .filter((m) => !f.customerId || m.customerId === f.customerId)
    .filter((m) => !f.entityId || (m.entity === f.entity && m.entityId === f.entityId))
    .filter((m) => !key || `${m.subject} ${m.body} ${m.party}`.toLowerCase().includes(key))
    .sort((a, b) => b.at.localeCompare(a.at));
}

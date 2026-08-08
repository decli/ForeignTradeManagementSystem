/**
 * 售前查询。跟其余查询一样是对内存账套的同步纯函数。
 *
 * 这里最值钱的两个派生量：
 *  · 询盘的 **SLA 状态** —— 首次响应超时与否，是询盘列表存在的理由；
 *  · 报价的 **让价轨迹** —— 同一个报价号的多个版本连成一条线。
 */

import { calcQuote } from "@/lib/quote-calc";
import { daysSince, daysUntil, isoDate } from "@/lib/format";
import type { Database } from "./types";
import type { Inquiry, QuoteLine, Quotation, SampleOrder } from "./presales-types";
import { SLA_BREACH_HOURS, SLA_WARN_HOURS } from "./presales-types";
import type { Viewer } from "./queries";
import { inScope } from "./queries";

const HOUR = 3_600_000;

/* ═══════════════════ 询盘 ═══════════════════ */

/** ok = 已按时回复；warn = 还没回但没超；breach = 超了还没回；late = 回了但当时超了 */
export type SlaState = "ok" | "warn" | "breach" | "late";

export type InquiryRow = Inquiry & {
  ownerName: string;
  productName: string | null;
  /** 首次响应用了多少小时。没回过就是「到现在多少小时」 */
  respondHours: number;
  sla: SlaState;
  /** 已经报了几版价 */
  quotes: number;
  /** 距下次跟进还有几天，负数 = 已经拖了 */
  followIn: number | null;
};

export function slaOf(inq: Inquiry, nowMs = Date.now()): { sla: SlaState; hours: number } {
  const received = Date.parse(inq.receivedAt);
  if (inq.firstReplyAt) {
    const h = (Date.parse(inq.firstReplyAt) - received) / HOUR;
    return { sla: h > SLA_BREACH_HOURS ? "late" : "ok", hours: h };
  }
  const h = (nowMs - received) / HOUR;
  /* 已经结案的询盘不再算超时 —— 一条三个月前流失的单子天天标红，
     红色就贬值了，真正今天要救的那三条反而看不见 */
  if (inq.status === "won" || inq.status === "lost") return { sla: "ok", hours: h };
  return { sla: h > SLA_BREACH_HOURS ? "breach" : h > SLA_WARN_HOURS ? "warn" : "ok", hours: h };
}

export type InquiryFilters = { q?: string; status?: string; source?: string; owner?: string; sla?: string };

export function listInquiries(db: Database, viewer: Viewer, f: InquiryFilters = {}): InquiryRow[] {
  const now = Date.now();
  const today = isoDate(new Date());
  const key = f.q?.trim().toLowerCase();
  return db.presales.inquiries
    .filter((i) => inScope(viewer, i.ownerId, null))
    .map((i): InquiryRow => {
      const { sla, hours } = slaOf(i, now);
      return {
        ...i,
        ownerName: db.users.find((u) => u.id === i.ownerId)?.name ?? "—",
        productName: db.ops.products.find((p) => p.id === i.productId)?.name ?? null,
        respondHours: hours,
        sla,
        quotes: db.presales.quotes.filter((q) => q.inquiryId === i.id).length,
        followIn: i.nextFollowOn ? daysUntil(i.nextFollowOn, today) : null,
      };
    })
    .filter((i) => !f.status || i.status === f.status)
    .filter((i) => !f.source || i.source === f.source)
    .filter((i) => !f.owner || i.ownerName === f.owner)
    .filter((i) => !f.sla || i.sla === f.sla)
    .filter((i) => !key || `${i.inquiryNo} ${i.company} ${i.country} ${i.contactName ?? ""} ${i.demand} ${i.productName ?? ""}`.toLowerCase().includes(key))
    /* 排序把「今天该干什么」顶上来：超时未回的最前，然后是快超时的，
       再按收到时间倒序。列表页第一屏就是当天的工作清单。 */
    .sort((a, b) => {
      const rank = (r: InquiryRow) => (r.sla === "breach" ? 0 : r.sla === "warn" ? 1 : 2);
      return rank(a) - rank(b) || b.receivedAt.localeCompare(a.receivedAt);
    });
}

export function inquiryKpis(rows: InquiryRow[]) {
  const open = rows.filter((r) => r.status === "new" || r.status === "working");
  const replied = rows.filter((r) => r.firstReplyAt);
  const avg = replied.length ? replied.reduce((s, r) => s + r.respondHours, 0) / replied.length : 0;
  const won = rows.filter((r) => r.status === "won").length;
  const closed = won + rows.filter((r) => r.status === "lost").length;
  return {
    open: open.length,
    breach: rows.filter((r) => r.sla === "breach").length,
    /** 平均首次响应，小时 */
    avgHours: avg,
    /** 成交率：成交 / 已结案。分母不含还在跟的，否则新询盘一多这个数就假性下跌 */
    winRate: closed ? (won / closed) * 100 : 0,
    won,
  };
}

/* ═══════════════════ 报价 ═══════════════════ */

export type QuoteRow = Quotation & {
  ownerName: string;
  lines: QuoteLine[];
  lineCount: number;
  /** 报价总额，分（报价币种） */
  totalCents: number;
  marginBp: number;
  profitCents: number;
  /** 还有几天过期，负数 = 已过期 */
  expireIn: number;
  /** 同一个报价号一共几版 */
  versions: number;
  /** 比上一版让了多少，基点。第一版是 0 */
  deltaBp: number;
  piNo: string | null;
};

export type QuoteFilters = { q?: string; status?: string; owner?: string; incoterm?: string; onlyLatest?: boolean };

/**
 * 报价列表。
 *
 * 默认**只显示每个报价号的最新一版** —— 一张报价谈了三轮就在列表里占三行，
 * 列表立刻不能看，而且业务员想找的永远是最新那版。历史版本在详情里看轨迹。
 */
export function listQuotes(db: Database, viewer: Viewer, f: QuoteFilters = {}): QuoteRow[] {
  const today = isoDate(new Date());
  const key = f.q?.trim().toLowerCase();
  const byNo = new Map<string, number>();
  for (const q of db.presales.quotes) byNo.set(q.quoteNo, Math.max(byNo.get(q.quoteNo) ?? 0, q.version));

  const rows = db.presales.quotes
    .filter((q) => inScope(viewer, q.ownerId, null))
    .map((q): QuoteRow => {
      const lines = db.presales.quoteLines.filter((l) => l.quoteId === q.id).sort((a, b) => a.seq - b.seq);
      const r = calcQuote(lines, q.calc, q.incoterm);
      const prev = q.prevId ? db.presales.quotes.find((x) => x.id === q.prevId) : null;
      const prevMargin = prev ? calcQuote(db.presales.quoteLines.filter((l) => l.quoteId === prev.id), prev.calc, prev.incoterm).marginBp : r.marginBp;
      return {
        ...q,
        ownerName: db.users.find((u) => u.id === q.ownerId)?.name ?? "—",
        lines,
        lineCount: lines.length,
        totalCents: r.revenueCents,
        marginBp: r.marginBp,
        profitCents: r.profitCents,
        expireIn: daysUntil(q.validUntil, today),
        versions: byNo.get(q.quoteNo) ?? 1,
        deltaBp: r.marginBp - prevMargin,
        piNo: q.piId ? db.pis.find((p) => p.id === q.piId)?.piNo ?? null : null,
      };
    });

  return rows
    .filter((q) => (f.onlyLatest === false ? true : q.version === byNo.get(q.quoteNo)))
    .filter((q) => !f.status || q.status === f.status)
    .filter((q) => !f.owner || q.ownerName === f.owner)
    .filter((q) => !f.incoterm || q.incoterm === f.incoterm)
    .filter((q) => !key || `${q.quoteNo} ${q.company} ${q.country} ${q.pod} ${q.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(key))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 一个报价号的完整版本链，从第 1 版排到最新 */
export function quoteHistory(db: Database, quoteNo: string): QuoteRow[] {
  const all = db.presales.quotes.filter((q) => q.quoteNo === quoteNo).sort((a, b) => a.version - b.version);
  return all.map((q) => {
    const lines = db.presales.quoteLines.filter((l) => l.quoteId === q.id).sort((a, b) => a.seq - b.seq);
    const r = calcQuote(lines, q.calc, q.incoterm);
    const prev = q.prevId ? all.find((x) => x.id === q.prevId) : null;
    const prevR = prev ? calcQuote(db.presales.quoteLines.filter((l) => l.quoteId === prev.id), prev.calc, prev.incoterm) : null;
    return {
      ...q,
      ownerName: "",
      lines,
      lineCount: lines.length,
      totalCents: r.revenueCents,
      marginBp: r.marginBp,
      profitCents: r.profitCents,
      expireIn: 0,
      versions: all.length,
      deltaBp: prevR ? r.marginBp - prevR.marginBp : 0,
      piNo: null,
    };
  });
}

export function quoteKpis(rows: QuoteRow[]) {
  const live = rows.filter((r) => r.status === "sent" || r.status === "negotiating");
  const won = rows.filter((r) => r.status === "accepted" || r.status === "converted");
  const decided = won.length + rows.filter((r) => r.status === "rejected" || r.status === "expired").length;
  const lowMargin = rows.filter((r) => (r.status === "sent" || r.status === "negotiating") && r.marginBp < 1100);
  return {
    live: live.length,
    liveValue: live.reduce((s, r) => s + r.totalCents, 0),
    winRate: decided ? (won.length / decided) * 100 : 0,
    expiring: rows.filter((r) => r.expireIn >= 0 && r.expireIn <= 3 && (r.status === "sent" || r.status === "negotiating")).length,
    lowMargin: lowMargin.length,
  };
}

/* ═══════════════════ 样品 ═══════════════════ */

export type SampleRow = SampleOrder & {
  ownerName: string;
  /** 距该催的日子还有几天，负数 = 早该催了 */
  followIn: number | null;
  /** 寄出后过了多少天还没反馈 */
  silentDays: number | null;
};

export function listSamples(db: Database, viewer: Viewer, f: { q?: string; status?: string } = {}): SampleRow[] {
  const today = isoDate(new Date());
  const key = f.q?.trim().toLowerCase();
  return db.presales.samples
    .filter((s) => inScope(viewer, s.ownerId, null))
    .map((s): SampleRow => ({
      ...s,
      ownerName: db.users.find((u) => u.id === s.ownerId)?.name ?? "—",
      followIn: s.followOn ? daysUntil(s.followOn, today) : null,
      silentDays: s.sentOn && !s.feedback ? daysSince(s.sentOn, today) : null,
    }))
    .filter((s) => !f.status || s.status === f.status)
    .filter((s) => !key || `${s.sampleNo} ${s.company} ${s.country} ${s.productName} ${s.trackingNo ?? ""}`.toLowerCase().includes(key))
    /* 按「该催的日子」排，早该催的顶在最上面。
       样品寄出去没下文是外贸最常见的漏斗断点，这个排序就是防它断的 */
    .sort((a, b) => {
      const done = (r: SampleRow) => (r.status === "closed" ? 1 : 0);
      return done(a) - done(b) || (a.followIn ?? 999) - (b.followIn ?? 999);
    });
}

export function sampleKpis(rows: SampleRow[]) {
  const live = rows.filter((r) => r.status !== "closed");
  return {
    live: live.length,
    overdue: live.filter((r) => r.followIn !== null && r.followIn < 0).length,
    silent: live.filter((r) => (r.silentDays ?? 0) > 14).length,
    cost: rows.reduce((s, r) => s + r.feeCents, 0),
  };
}

/* ═══════════════════ 漏斗 ═══════════════════ */

/**
 * 售前漏斗。
 *
 * 转化率算的是**相邻两段之比**，不是各段对询盘总数的比 ——
 * 老板想知道的是"卡在哪一环"，那要看每一环自己的通过率。
 *
 * ── 寄样为什么不在这条线上 ──
 * 一开始把它排在"已回复 → 已寄样 → 已报价"中间，结果通过率跑出了 **125%**。
 * 原因不是算错，是**建模错了**：寄样根本不是报价的必经环节 ——
 * 现货类目直接报价，只有需要打样确认的才寄样。把一个可选分支串进主链，
 * 分母就永远比分子小。
 *
 * 所以主链只留真正逐级收敛的四段，寄样单独返回、用询盘总数当分母。
 * 一个永远不可能超过 100% 的漏斗，比一个"看起来层次更丰富"的漏斗有用。
 */
export function funnelOf(db: Database, viewer: Viewer) {
  const inq = db.presales.inquiries.filter((i) => inScope(viewer, i.ownerId, null));
  const quoted = new Set(db.presales.quotes.filter((q) => inScope(viewer, q.ownerId, null)).map((q) => q.inquiryId).filter(Boolean));
  const sampled = new Set(db.presales.samples.filter((s) => inScope(viewer, s.ownerId, null)).map((s) => s.inquiryId).filter(Boolean));
  const won = inq.filter((i) => i.status === "won").length;

  const steps = [
    { key: "询盘", n: inq.length },
    { key: "已回复", n: inq.filter((i) => i.firstReplyAt).length },
    { key: "已报价", n: quoted.size },
    { key: "已成交", n: won },
  ];
  const main = steps.map((s, i) => ({
    ...s,
    /** 相对上一段的通过率。第一段没有上一段，给 100 */
    rate: i === 0 ? 100 : steps[i - 1].n > 0 ? (s.n / steps[i - 1].n) * 100 : 0,
    branch: false,
  }));
  // 寄样是可选分支，分母用询盘总数
  main.push({ key: "其中寄过样", n: sampled.size, rate: inq.length ? (sampled.size / inq.length) * 100 : 0, branch: true });
  return main;
}

/** 询盘来源统计。投在各渠道的钱回报如何，就看这张表 */
export function sourceStats(db: Database, viewer: Viewer) {
  const rows = db.presales.inquiries.filter((i) => inScope(viewer, i.ownerId, null));
  const map = new Map<string, { n: number; won: number }>();
  for (const i of rows) {
    const cur = map.get(i.source) ?? { n: 0, won: 0 };
    cur.n++;
    if (i.status === "won") cur.won++;
    map.set(i.source, cur);
  }
  return [...map.entries()]
    .map(([source, v]) => ({ source, ...v, rate: v.n ? (v.won / v.n) * 100 : 0 }))
    .sort((a, b) => b.n - a.n);
}

/** 流失原因统计。丢单丢在价格上还是交期上，这是唯一说得清的地方 */
export function lostStats(db: Database, viewer: Viewer) {
  const rows = db.presales.inquiries.filter((i) => i.status === "lost" && inScope(viewer, i.ownerId, null));
  const map = new Map<string, number>();
  for (const i of rows) map.set(i.lostReason ?? "其他", (map.get(i.lostReason ?? "其他") ?? 0) + 1);
  return [...map.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);
}

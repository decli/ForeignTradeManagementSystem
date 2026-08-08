/**
 * 派生型通知。
 *
 * ── 为什么不落库 ──
 * 站内的预警（交期到了、额度快满、样品没人催、报价要过期）全都是
 * **当前数据的函数**。把它们写成一条条通知记录，就要额外回答一个问题：
 * 单子改好之后，谁负责把那条通知删掉？答案通常是没人 ——
 * 于是铃铛上永远挂着七个红点，其中五个早就处理完了。
 * 一个已经处理完却还亮着的红点，比没有红点更糟：它训练用户忽略红点。
 *
 * 所以这些每次实时算。改好了自己就消失，不需要任何人去关它。
 * 只有**事件型**的（审批到你了、单子分给你了）才落库，见 flow-types.ts。
 *
 * ── 排序即优先级 ──
 * 返回顺序就是显示顺序：能造成损失的排前面（逾期回款、超时询盘），
 * 只是"该做点什么"的排后面（报价要过期、样品该催了）。
 */

import type { Database } from "@/data/types";
import type { Viewer } from "@/data/queries";
import { inScope } from "@/data/queries";
import type { NoticeRow } from "@/data/flow-queries";
import { listAging } from "@/data/flow-queries";
import { slaOf } from "@/data/presales-queries";
import { calcQuote } from "@/lib/quote-calc";
import { daysSince, daysUntil, isoDate } from "@/lib/format";
import { SINOSURE_WARN, STALL_DAYS } from "@/lib/rules";
import { tr } from "@/i18n";

/** 每一类最多冒几条。十条同类通知说明的信息量跟三条一样，还把别的挤没了 */
const CAP = 3;

export function deriveNotices(db: Database, viewer: Viewer): NoticeRow[] {
  const out: NoticeRow[] = [];
  const today = isoDate(new Date());
  const now = new Date().toISOString();
  let n = 0;
  const add = (kind: string, title: string, body: string, href: string) => {
    out.push({ id: `d_${kind}_${++n}`, kind, title, body, href, read: false, at: now, derived: true });
  };

  /* ① 逾期回款 —— 直接造成损失，排最前 */
  const aging = listAging(db, viewer).filter((r) => r.overdue > 0);
  aging.slice(0, CAP).forEach((r) => {
    add("overdue", tr("回款逾期 {n} 天", { n: r.overdue }), tr("{pi} · {cus} 还有 {amt} 没收", { pi: r.piNo, cus: r.customer, amt: `${r.currency} ${(r.openCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` }), `/receivables?q=${r.piNo}`);
  });

  /* ② 询盘超时未回 —— 直接丢生意 */
  const breached = db.presales.inquiries
    .filter((i) => inScope(viewer, i.ownerId, null))
    .filter((i) => slaOf(i).sla === "breach");
  breached.slice(0, CAP).forEach((i) => {
    add("inquiry", tr("询盘超过 24 小时没回"), tr("{co} · {no}", { co: i.company, no: i.inquiryNo }), `/inquiries?sla=breach`);
  });

  /* ③ 中信保额度快满 —— 再发货就是裸奔 */
  db.customers
    .filter((c) => c.active && c.sinosureLimitCents > 0 && c.sinosureUsedCents / c.sinosureLimitCents >= SINOSURE_WARN)
    .filter((c) => inScope(viewer, c.salesId, null))
    .slice(0, CAP)
    .forEach((c) => {
      add("credit", tr("{cus} 额度已用 {pct}%", { cus: c.name, pct: Math.round((c.sinosureUsedCents / c.sinosureLimitCents) * 100) }), tr("再安排出运需要走超额度审批"), `/sinosure?q=${encodeURIComponent(c.name)}`);
    });

  /* ④ 出运停滞 —— 货卡在半路没人管 */
  db.shipments
    .filter((s) => !s.archived && inScope(viewer, s.salesId, null))
    .filter((s) => s.releaseState !== "已放行" && s.latestNoteOn && daysSince(s.latestNoteOn, today) >= STALL_DAYS)
    .slice(0, CAP)
    .forEach((s) => {
      add("stall", tr("{no} 已经 {n} 天没有新动态", { no: s.batchNo, n: daysSince(s.latestNoteOn!, today) }), s.latestNote ?? tr("去跟单表看看卡在哪"), `/follow-ups?q=${s.batchNo}`);
    });

  /* ⑤ 报价即将过期 —— 该做点什么，但还没损失 */
  const quoteLatest = new Map<string, number>();
  for (const q of db.presales.quotes) quoteLatest.set(q.quoteNo, Math.max(quoteLatest.get(q.quoteNo) ?? 0, q.version));
  db.presales.quotes
    .filter((q) => q.version === quoteLatest.get(q.quoteNo))
    .filter((q) => inScope(viewer, q.ownerId, null))
    .filter((q) => (q.status === "sent" || q.status === "negotiating") && daysUntil(q.validUntil, today) >= 0 && daysUntil(q.validUntil, today) <= 3)
    .slice(0, CAP)
    .forEach((q) => {
      add("quote", tr("报价 {n} 天内过期", { n: daysUntil(q.validUntil, today) }), tr("{no} · {co}", { no: q.quoteNo, co: q.company }), `/quotes?q=${q.quoteNo}`);
    });

  /* ⑥ 样品该催了 */
  db.presales.samples
    .filter((s) => inScope(viewer, s.ownerId, null))
    .filter((s) => s.status !== "closed" && s.followOn && daysSince(s.followOn, today) > 0)
    .slice(0, CAP)
    .forEach((s) => {
      add("sample", tr("样品该催反馈了"), tr("{no} · {co} · 寄出已 {n} 天", { no: s.sampleNo, co: s.company, n: s.sentOn ? daysSince(s.sentOn, today) : 0 }), `/samples?q=${s.sampleNo}`);
    });

  /* ⑦ 供应商资质到期 —— 过期就不能下单 */
  db.ops.suppliers
    .filter((s) => s.active && s.certExpiry && daysUntil(s.certExpiry, today) >= 0 && daysUntil(s.certExpiry, today) <= 30)
    .slice(0, 2)
    .forEach((s) => {
      add("cert", tr("{sup} 资质 {n} 天内到期", { sup: s.name, n: daysUntil(s.certExpiry!, today) }), tr("过期后不能给他下单，提前提醒换证"), `/suppliers?q=${encodeURIComponent(s.name)}`);
    });

  /* ⑧ 低于红线还没送审的报价 —— 这条是在替业务员挡雷 */
  db.presales.quotes
    .filter((q) => q.version === quoteLatest.get(q.quoteNo) && (q.status === "sent" || q.status === "negotiating"))
    .filter((q) => inScope(viewer, q.ownerId, null))
    .filter((q) => {
      const lines = db.presales.quoteLines.filter((l) => l.quoteId === q.id);
      if (!lines.length) return false;
      const r = calcQuote(lines, q.calc, q.incoterm);
      const submitted = db.flow.approvals.some((a) => a.entityId === q.id && a.kind === "discount");
      return r.marginBp < 1100 && !submitted;
    })
    .slice(0, 2)
    .forEach((q) => {
      add("lowmargin", tr("报价低于利润率红线，还没送审"), tr("{no} · {co}", { no: q.quoteNo, co: q.company }), `/quotes?q=${q.quoteNo}`);
    });

  return out;
}

/**
 * 审批 / 通知 / 往来 / 自定义字段的演示数据。
 *
 * 审批单**从真实数据里长出来**，不是随机生成的：利润率低于红线的那几张 PI、
 * 让价超过 5 个点的那几版报价、金额过线的那几笔付款申请。
 * 随机生成的审批单点进去会发现单据本身没问题，一眼就假。
 */

import type { Database } from "./types";
import type { ApprovalRequest, ApprovalRule, CustomFieldDef, FlowData, Message, Notification } from "./flow-types";
import { calcQuote } from "@/lib/quote-calc";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function buildFlowSeed(db: Database): FlowData {
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  let n = 0;
  const id = (p: string) => `${p}_${(++n).toString(36).padStart(4, "0")}`;
  const year = new Date().getFullYear().toString().slice(2);

  const admin = db.users.find((u) => u.role === "admin")!;
  const finance = db.users.find((u) => u.role === "finance")!;
  const nameOf = (uid: string | null) => db.users.find((u) => u.id === uid)?.name ?? "—";

  /* ═══════════ 审批规则 ═══════════ */
  const approvalRules: ApprovalRule[] = [
    {
      id: id("ar"),
      kind: "low_margin",
      enabled: true,
      /* 11% 是站内的利润率红线（lib/rules.ts 里 PROFIT_WARN_PCT），
         两处必须是同一个数 —— 看板标黄的单子和需要审批的单子应该是同一批，
         不然业务员会问「为什么这单标黄了却不用审」 */
      threshold: 1100,
      approverIds: [admin.id],
      note: "利润率低于 11% 的订单，签之前要老板拍板",
    },
    { id: id("ar"), kind: "discount", enabled: true, threshold: 500, approverIds: [admin.id], note: "报价低于标准价 5 个点以上，要留痕" },
    { id: id("ar"), kind: "credit", enabled: true, threshold: 8500, approverIds: [admin.id, finance.id], note: "中信保额度占用超 85% 还要发货" },
    { id: id("ar"), kind: "payment", enabled: true, threshold: 200_000_00, approverIds: [finance.id, admin.id], note: "单笔付款超 20 万人民币" },
  ];

  /* ═══════════ 审批单 ═══════════ */
  const approvals: ApprovalRequest[] = [];

  const addApproval = (o: {
    kind: string;
    entity: string;
    entityId: string;
    entityLabel: string;
    summary: string;
    amount: number;
    currency: string;
    requesterId: string | null;
    reason: string;
    status: string;
    hoursAgo: number;
  }) => {
    const rule = approvalRules.find((r) => r.kind === o.kind)!;
    const closed = o.status !== "pending";
    const createdMs = nowMs - o.hoursAgo * HOUR;
    approvals.push({
      id: id("ap"),
      requestNo: `AP${year}${String(500 + approvals.length)}`,
      kind: o.kind,
      entity: o.entity,
      entityId: o.entityId,
      entityLabel: o.entityLabel,
      summary: o.summary,
      amount: o.amount,
      currency: o.currency,
      requesterId: o.requesterId,
      requesterName: nameOf(o.requesterId),
      reason: o.reason,
      status: o.status,
      steps: rule.approverIds.map((uid, i) => ({
        approverId: uid,
        approverName: nameOf(uid),
        // 多级审批里，已通过的单子每一级都走完了；驳回的单子停在驳回那一级
        state: closed ? (o.status === "rejected" && i > 0 ? "pending" : o.status === "rejected" ? "rejected" : "approved") : i === 0 ? "pending" : "pending",
        at: closed && (o.status !== "rejected" || i === 0) ? iso(createdMs + (i + 1) * 5 * HOUR) : null,
        comment: closed && i === 0 ? (o.status === "rejected" ? "这个价做不了，让客户加量或者换规格" : "同意，下不为例") : null,
      })),
      cursor: closed ? rule.approverIds.length : 0,
      createdAt: iso(createdMs),
      closedAt: closed ? iso(createdMs + 6 * HOUR) : null,
    });
  };

  // 低利润率订单 —— 从真实 costing 里挑
  const lowMargin = db.costings
    .filter((c) => c.profitRateBp < 1100)
    .slice(0, 6)
    .map((c) => ({ c, pi: db.pis.find((p) => p.id === c.piId)! }))
    .filter((x) => !!x.pi);

  lowMargin.forEach((x, i) => {
    const pending = i < 3;
    addApproval({
      kind: "low_margin",
      entity: "pi",
      entityId: x.pi.id,
      entityLabel: x.pi.piNo,
      summary: `${x.pi.piNo} · ${db.customers.find((c) => c.id === x.pi.customerId)?.name ?? ""} 利润率 ${(x.c.profitRateBp / 100).toFixed(2)}%`,
      amount: x.c.profitRateBp,
      currency: x.pi.currency,
      requesterId: x.pi.salesId,
      reason: x.c.profitRateBp < 0 ? "客户是老客户，这单亏一点换明年的量" : "同行压价，先接下来把产能占住",
      status: pending ? "pending" : i === 3 ? "rejected" : "approved",
      hoursAgo: 6 + i * 19,
    });
  });

  // 特价报价 —— 让价幅度从报价单的核算结果里算
  const discounted = db.presales.quotes.filter((q) => q.version > 1 && q.status === "negotiating").slice(0, 3);
  discounted.forEach((q, i) => {
    const lines = db.presales.quoteLines.filter((l) => l.quoteId === q.id);
    const r = calcQuote(lines, q.calc, q.incoterm);
    addApproval({
      kind: "discount",
      entity: "quote",
      entityId: q.id,
      entityLabel: `${q.quoteNo} v${q.version}`,
      summary: `${q.quoteNo} 第 ${q.version} 版 · ${q.company} 利润率 ${(r.marginBp / 100).toFixed(2)}%`,
      amount: r.marginBp,
      currency: q.currency,
      requesterId: q.ownerId,
      reason: q.revisionNote ?? "客户要求让价",
      status: i === 0 ? "pending" : "approved",
      hoursAgo: 3 + i * 27,
    });
  });

  // 超额度放账
  const overCredit = db.customers
    .filter((c) => c.sinosureLimitCents > 0 && c.sinosureUsedCents / c.sinosureLimitCents > 0.85)
    .slice(0, 2);
  overCredit.forEach((c, i) => {
    const pct = Math.round((c.sinosureUsedCents / c.sinosureLimitCents) * 10_000);
    addApproval({
      kind: "credit",
      entity: "customer",
      entityId: c.id,
      entityLabel: c.name,
      summary: `${c.name} 额度已用 ${(pct / 100).toFixed(1)}%，仍要安排出运`,
      amount: pct,
      currency: "USD",
      requesterId: c.salesId,
      reason: "客户承诺本周内回款，货已经生产完压在仓库",
      status: i === 0 ? "pending" : "approved",
      hoursAgo: 11 + i * 40,
    });
  });

  // 大额付款申请
  db.ops.payments
    .filter((p) => p.direction === "out" && p.cnyCents > 200_000_00)
    .slice(0, 3)
    .forEach((p, i) => {
      addApproval({
        kind: "payment",
        entity: "payment",
        entityId: p.id,
        entityLabel: p.paymentNo,
        summary: `付 ${p.counterparty} ¥${(p.cnyCents / 100).toLocaleString("zh-CN")}`,
        amount: p.cnyCents,
        currency: "CNY",
        requesterId: db.users.find((u) => u.role === "purchaser")?.id ?? null,
        reason: "合同约定的 30% 定金，工厂等这笔钱排产",
        status: i === 0 ? "pending" : "approved",
        hoursAgo: 5 + i * 33,
      });
    });

  /* ═══════════ 通知 ═══════════ */
  /* 只有**事件型**通知落库（审批到你了、单子分给你了）。
     派生型的（某单超期、某客户额度快满）由 lib/notify.ts 从当前数据实时算，
     单子改好通知就自己消失，不需要谁去手工关掉。 */
  const notifications: Notification[] = [];
  approvals
    .filter((a) => a.status === "pending")
    .forEach((a, i) => {
      notifications.push({
        id: id("nt"),
        kind: "approval",
        userId: a.steps[0]?.approverId ?? null,
        title: "有一笔审批等你",
        body: a.summary,
        href: `/approvals?id=${a.id}`,
        read: false,
        at: a.createdAt,
      });
      if (i === 0) {
        notifications.push({
          id: id("nt"),
          kind: "system",
          userId: a.requesterId,
          title: "你提交的审批已受理",
          body: `${a.requestNo} · ${a.summary}`,
          href: `/approvals?id=${a.id}`,
          read: true,
          at: a.createdAt,
        });
      }
    });
  notifications.push({
    id: id("nt"),
    kind: "system",
    userId: null,
    title: "本月退税申报还差 3 张发票没关联订单",
    body: "退税管理 → 未关联，点一下就能挂到 PI 上",
    href: "/tax-refund?unlinked=1",
    read: false,
    at: iso(nowMs - 5 * HOUR),
  });

  /* ═══════════ 往来沟通 ═══════════ */
  const messages: Message[] = [];
  const THREADS: Array<{ subject: string; body: string; dir: "in" | "out" }> = [
    { subject: "Re: PI confirmation and shipping schedule", body: "Hi, we have signed the PI and will arrange the 30% deposit this week. Please confirm the production schedule once payment is received.", dir: "in" },
    { subject: "PI confirmation and shipping schedule", body: "Dear customer,\n\nPlease find attached the signed PI. Production will start upon receipt of the deposit. Estimated ready date is 25 days after payment.\n\nBest regards", dir: "out" },
    { subject: "Quality issue on last shipment", body: "We found around 300 pcs with loose ear loops in the last container. Photos attached. Please advise how you will compensate.", dir: "in" },
    { subject: "Re: Quality issue on last shipment", body: "We are very sorry about this. We have raised it with the factory. We propose to compensate 400 pcs free of charge in your next order. Please confirm if acceptable.", dir: "out" },
    { subject: "Price increase notice from April", body: "Due to the rise in nonwoven raw material prices, our quotation will be adjusted by 4% from 1 April. Orders confirmed before then are unaffected.", dir: "out" },
    { subject: "Documents required for customs clearance", body: "Our broker needs the Form E and the original B/L by Friday, otherwise we will incur demurrage at the port.", dir: "in" },
  ];

  db.customers.slice(0, 9).forEach((c, ci) => {
    const sales = db.users.find((u) => u.id === c.salesId);
    const contact = db.contacts.find((x) => x.customerId === c.id && x.primary);
    const count = 2 + (ci % 3);
    for (let i = 0; i < count; i++) {
      const t = THREADS[(ci + i) % THREADS.length];
      const pi = db.pis.find((p) => p.customerId === c.id);
      messages.push({
        id: id("msg"),
        customerId: c.id,
        entity: pi && i % 2 === 0 ? "pi" : null,
        entityId: pi && i % 2 === 0 ? pi.id : null,
        channel: i % 4 === 3 ? "WhatsApp" : "邮件",
        direction: t.dir,
        subject: t.subject,
        body: t.body,
        party: contact?.name ?? c.contact ?? c.name,
        userId: sales?.id ?? null,
        userName: sales?.name ?? "—",
        at: iso(nowMs - (ci * 3 + i) * DAY - (i * 7) * HOUR),
        externalId: null,
        attachmentIds: [],
      });
    }
  });
  messages.sort((a, b) => b.at.localeCompare(a.at));

  /* ═══════════ 自定义字段 ═══════════ */
  /* 出厂就带三条，不是为了凑数 —— 空的自定义字段页面说明不了这个功能能干什么。
     这三条也是实施时最常被要求加的三个。 */
  const customFields: CustomFieldDef[] = [
    {
      id: id("cf"),
      entity: "customer",
      key: "channel",
      label: "客户来源",
      labelEn: "Lead source",
      type: "select",
      options: ["阿里国际站", "展会", "客户介绍", "领英", "自主开发"],
      required: false,
      inList: true,
      order: 1,
      hint: "投在各渠道的钱回报如何，靠这个字段统计",
    },
    {
      id: id("cf"),
      entity: "customer",
      key: "forwarder",
      label: "指定货代",
      labelEn: "Nominated forwarder",
      type: "text",
      options: [],
      required: false,
      inList: false,
      order: 2,
      hint: "客户指定货代的，订舱前要按这个来",
    },
    {
      id: id("cf"),
      entity: "pi",
      key: "shipmark",
      label: "唛头要求",
      labelEn: "Shipping marks",
      type: "text",
      options: [],
      required: false,
      inList: false,
      order: 1,
      hint: "改版要重新跟客户确认",
    },
  ];

  return { approvalRules, approvals, notifications, messages, customFields };
}

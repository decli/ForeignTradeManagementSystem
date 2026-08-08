/**
 * 售前的写操作。
 *
 * 最要紧的一个是 `convertToPi` —— 报价转 PI。它是整个售前模块的出口，
 * 也是"明细行同构"这个设计唯一要兑现的地方：整行搬过去，不做任何翻译。
 */

import { mutate, pushAudit, snapshot } from "./db";
import type { Actor } from "./mutations";
import type { Database, PiLine } from "./types";
import { lineAmount } from "./types";
import type { Incoterm, Inquiry, QuoteCalcInput, QuoteLine, Quotation, SampleOrder } from "./presales-types";
import { defaultCalc } from "@/lib/quote-calc";

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const yy = () => String(new Date().getFullYear()).slice(2);

/** 下一个单号。同一前缀下取最大值 +1，不用计数器 —— 导入别人的账套时计数器会错 */
function nextNo(existing: string[], prefix: string, start: number) {
  const used = existing.filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length)) || 0);
  return `${prefix}${(used.length ? Math.max(...used) : start) + 1}`;
}

export const nextInquiryNo = (db: Database) => nextNo(db.presales.inquiries.map((i) => i.inquiryNo), `INQ${yy()}`, 1000);
export const nextQuoteNo = (db: Database) => nextNo(db.presales.quotes.map((q) => q.quoteNo), `QT${yy()}`, 2000);
export const nextSampleNo = (db: Database) => nextNo(db.presales.samples.map((s) => s.sampleNo), `SMP${yy()}`, 300);

/* ═══════════════════ 询盘 ═══════════════════ */

export type NewInquiry = {
  company: string;
  country: string;
  contactName: string;
  email: string;
  im: string;
  source: string;
  demand: string;
  productId: string | null;
  qty: number | null;
  targetPrice: number;
  ownerId: string | null;
  customerId: string | null;
};

export function createInquiry(actor: Actor, input: NewInquiry) {
  if (!input.company.trim()) return { ok: false as const, error: "公司名不能为空" };
  let id = "";
  mutate((db) => {
    id = rid("inq");
    const no = nextInquiryNo(db);
    const row: Inquiry = {
      id,
      inquiryNo: no,
      customerId: input.customerId,
      company: input.company.trim(),
      country: input.country.trim() || "—",
      contactName: input.contactName.trim() || null,
      email: input.email.trim() || null,
      im: input.im.trim() || null,
      source: input.source,
      demand: input.demand.trim(),
      productId: input.productId,
      qty: input.qty,
      unit: db.ops.products.find((p) => p.id === input.productId)?.unit ?? "pcs",
      targetPriceCents: Math.round(input.targetPrice * 100),
      status: "new",
      lostReason: null,
      ownerId: input.ownerId,
      receivedAt: nowIso(),
      firstReplyAt: null,
      lastTouchAt: null,
      nextFollowOn: null,
      note: null,
      createdAt: nowIso(),
    };
    db.presales = { ...db.presales, inquiries: [row, ...db.presales.inquiries] };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Inquiry", entityId: id, entityLabel: no, action: "新建询盘", before: null, after: JSON.stringify({ 公司: row.company, 来源: row.source }) });
  });
  return { ok: true as const, id };
}

/**
 * 记一次回复。
 *
 * 只有**第一次**会写 firstReplyAt —— SLA 算的是首次响应，
 * 后面回一百次也不改变"当初隔了多久才理人家"这件事。
 */
export function replyInquiry(actor: Actor, id: string, nextFollowOn: string | null) {
  mutate((db) => {
    db.presales = {
      ...db.presales,
      inquiries: db.presales.inquiries.map((i) =>
        i.id === id
          ? {
              ...i,
              firstReplyAt: i.firstReplyAt ?? nowIso(),
              lastTouchAt: nowIso(),
              nextFollowOn: nextFollowOn ?? i.nextFollowOn,
              status: i.status === "new" ? "working" : i.status,
            }
          : i,
      ),
    };
    const row = db.presales.inquiries.find((i) => i.id === id);
    if (row) pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Inquiry", entityId: id, entityLabel: row.inquiryNo, action: "记录跟进", before: null, after: JSON.stringify({ 下次跟进: nextFollowOn ?? "—" }) });
  });
}

export function setInquiryStatus(actor: Actor, id: string, status: string, lostReason?: string) {
  mutate((db) => {
    const before = db.presales.inquiries.find((i) => i.id === id);
    db.presales = {
      ...db.presales,
      inquiries: db.presales.inquiries.map((i) =>
        i.id === id ? { ...i, status, lostReason: status === "lost" ? lostReason ?? "其他" : null, lastTouchAt: nowIso() } : i,
      ),
    };
    if (before) {
      pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Inquiry", entityId: id, entityLabel: before.inquiryNo, action: "改询盘状态", before: JSON.stringify({ 状态: before.status }), after: JSON.stringify({ 状态: status, 原因: lostReason ?? "" }) });
    }
  });
}

/* ═══════════════════ 报价 ═══════════════════ */

/**
 * 从询盘开一张报价。
 *
 * 询盘上的产品和数量直接带过来 —— 业务员刚读完客户的邮件，
 * 不该再手抄一遍数量和品名。带不过来的（客户没说具体规格）留空，
 * 但**绝不猜**：报价单上一个猜出来的数量比空着危险得多。
 */
export function createQuote(actor: Actor, o: { inquiryId: string | null; customerId: string | null; company: string; country: string; ownerId: string | null }) {
  let id = "";
  mutate((db) => {
    id = rid("qt");
    const no = nextQuoteNo(db);
    const inq = o.inquiryId ? db.presales.inquiries.find((i) => i.id === o.inquiryId) : null;
    const rate = db.fxRates.find((r) => r.kind === "market")?.rateE6 ?? 6_700_000;
    const row: Quotation = {
      id,
      quoteNo: no,
      version: 1,
      prevId: null,
      inquiryId: o.inquiryId,
      customerId: o.customerId,
      company: o.company,
      country: o.country,
      contactId: o.customerId ? db.contacts.find((c) => c.customerId === o.customerId && c.primary)?.id ?? null : null,
      currency: "USD",
      incoterm: "FOB",
      pol: "Xiamen",
      pod: "",
      validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
      leadDays: 30,
      payTerm: "30% T/T 定金，70% 见提单副本",
      status: "draft",
      revisionNote: null,
      piId: null,
      ownerId: o.ownerId,
      sellerEntityId: db.sellerEntities.find((e) => e.active)?.id ?? null,
      calc: defaultCalc(rate),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const lines: QuoteLine[] = [];
    if (inq?.productId) {
      const prd = db.ops.products.find((p) => p.id === inq.productId);
      if (prd) {
        lines.push({
          id: rid("ql"),
          quoteId: id,
          seq: 1,
          productId: prd.id,
          name: prd.name,
          nameEn: prd.nameEn ?? null,
          hsCode: prd.hsCode,
          refundRateBp: prd.refundRateBp,
          qty: inq.qty ?? 0,
          unit: prd.unit,
          // 客户报的目标价先填上 —— 谈判的锚就是它，业务员第一件事是看这个价能不能做
          unitPriceE4: inq.targetPriceCents > 0 ? inq.targetPriceCents * 100 : 0,
          costE4: prd.lastCostCents * 100,
          packQty: prd.packQty,
          grossWeightG: prd.grossWeightG,
          volumeCm3: prd.volumeCm3,
          note: null,
        });
      }
    }
    db.presales = { ...db.presales, quotes: [row, ...db.presales.quotes], quoteLines: [...db.presales.quoteLines, ...lines] };
    if (o.inquiryId) {
      db.presales = {
        ...db.presales,
        inquiries: db.presales.inquiries.map((i) => (i.id === o.inquiryId ? { ...i, status: i.status === "won" || i.status === "lost" ? i.status : "quoted", firstReplyAt: i.firstReplyAt ?? nowIso() } : i)),
      };
    }
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Quotation", entityId: id, entityLabel: no, action: "新建报价", before: null, after: JSON.stringify({ 客户: o.company }) });
  });
  return { ok: true as const, id };
}

export function patchQuote(id: string, patch: Partial<Quotation>) {
  mutate((db) => {
    db.presales = {
      ...db.presales,
      quotes: db.presales.quotes.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: nowIso() } : q)),
    };
  });
}

export function patchCalc(id: string, patch: Partial<QuoteCalcInput>) {
  mutate((db) => {
    db.presales = {
      ...db.presales,
      quotes: db.presales.quotes.map((q) => (q.id === id ? { ...q, calc: { ...q.calc, ...patch }, updatedAt: nowIso() } : q)),
    };
  });
}

export function addQuoteLine(quoteId: string, productId: string | null) {
  mutate((db) => {
    const prd = productId ? db.ops.products.find((p) => p.id === productId) : null;
    const seq = db.presales.quoteLines.filter((l) => l.quoteId === quoteId).length + 1;
    const line: QuoteLine = {
      id: rid("ql"),
      quoteId,
      seq,
      productId: prd?.id ?? null,
      name: prd?.name ?? "",
      nameEn: prd?.nameEn ?? null,
      hsCode: prd?.hsCode ?? null,
      refundRateBp: prd?.refundRateBp ?? 1300,
      qty: 0,
      unit: prd?.unit ?? "pcs",
      unitPriceE4: 0,
      costE4: prd ? prd.lastCostCents * 100 : 0,
      packQty: prd?.packQty ?? 0,
      grossWeightG: prd?.grossWeightG ?? 0,
      volumeCm3: prd?.volumeCm3 ?? 0,
      note: null,
    };
    db.presales = { ...db.presales, quoteLines: [...db.presales.quoteLines, line] };
  });
}

export function patchQuoteLine(id: string, patch: Partial<QuoteLine>) {
  mutate((db) => {
    db.presales = {
      ...db.presales,
      quoteLines: db.presales.quoteLines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
  });
}

export function removeQuoteLine(id: string) {
  mutate((db) => {
    db.presales = { ...db.presales, quoteLines: db.presales.quoteLines.filter((l) => l.id !== id) };
  });
}

/** 一次性把所有行的单价改掉（反算出来的建议价） */
export function applyPrices(quoteId: string, prices: number[]) {
  mutate((db) => {
    const lines = db.presales.quoteLines.filter((l) => l.quoteId === quoteId).sort((a, b) => a.seq - b.seq);
    const map = new Map(lines.map((l, i) => [l.id, prices[i] ?? l.unitPriceE4]));
    db.presales = {
      ...db.presales,
      quoteLines: db.presales.quoteLines.map((l) => (map.has(l.id) ? { ...l, unitPriceE4: map.get(l.id)! } : l)),
    };
  });
}

/**
 * 开新一版（议价）。
 *
 * 整张单连同明细行复制一份，版本号 +1，`prevId` 指向上一版。
 * 旧版本**不删也不改**，只是状态落到 negotiating —— 让价轨迹的价值
 * 全在于旧版本还在那儿，能看出这单是怎么一步步谈下来的。
 */
export function reviseQuote(actor: Actor, quoteId: string, note: string) {
  let id = "";
  mutate((db) => {
    const src = db.presales.quotes.find((q) => q.id === quoteId);
    if (!src) return;
    id = rid("qt");
    const maxV = Math.max(...db.presales.quotes.filter((q) => q.quoteNo === src.quoteNo).map((q) => q.version));
    const next: Quotation = {
      ...src,
      id,
      version: maxV + 1,
      prevId: src.id,
      status: "negotiating",
      revisionNote: note.trim() || null,
      piId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const lines = db.presales.quoteLines
      .filter((l) => l.quoteId === quoteId)
      .map((l) => ({ ...l, id: rid("ql"), quoteId: id }));
    db.presales = {
      ...db.presales,
      quotes: [next, ...db.presales.quotes.map((q) => (q.id === quoteId ? { ...q, status: "negotiating" } : q))],
      quoteLines: [...db.presales.quoteLines, ...lines],
    };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Quotation", entityId: id, entityLabel: `${src.quoteNo} v${maxV + 1}`, action: "开新一版报价", before: null, after: JSON.stringify({ 让价理由: note }) });
  });
  return id;
}

/**
 * 报价转 PI。
 *
 * ── 为什么明细行是整行搬过去 ──
 * QuoteLine 和 PiLine 的字段是同构的（这是 presales-types.ts 里那条硬约定）。
 * 一旦这里要做字段翻译，就一定会有字段在翻译中丢掉 —— 通常是 HS 编码和包装，
 * 而那正是三个月后做装箱单和报关时要用的东西。
 *
 * ── PI 金额从明细行合计来 ──
 * 不从报价单上另存一个总额，那会立刻出现两个真相。
 */
export function convertToPi(actor: Actor, quoteId: string, piNo: string) {
  const db0 = snapshot();
  const q = db0.presales.quotes.find((x) => x.id === quoteId);
  if (!q) return { ok: false as const, error: "报价单不存在" };
  if (!q.customerId) return { ok: false as const, error: "这张报价还挂在潜客上，先把客户建档再转 PI" };
  const lines = db0.presales.quoteLines.filter((l) => l.quoteId === quoteId);
  if (!lines.length) return { ok: false as const, error: "报价单一行明细都没有，转不了 PI" };
  if (db0.pis.some((p) => p.piNo === piNo.trim())) return { ok: false as const, error: `PI 号 ${piNo} 已经存在` };

  let piId = "";
  mutate((db) => {
    piId = rid("pi");
    const cust = db.customers.find((c) => c.id === q.customerId);
    const piLines: PiLine[] = lines
      .sort((a, b) => a.seq - b.seq)
      .map((l, i) => ({
        id: rid("pil"),
        piId,
        seq: i + 1,
        productId: l.productId,
        name: l.name,
        nameEn: l.nameEn,
        hsCode: l.hsCode,
        refundRateBp: l.refundRateBp,
        qty: l.qty,
        unit: l.unit,
        unitPriceE4: l.unitPriceE4,
        costE4: l.costE4,
        packQty: l.packQty,
        grossWeightG: l.grossWeightG,
        volumeCm3: l.volumeCm3,
        note: l.note,
      }));
    const amountCents = piLines.reduce((s, l) => s + lineAmount(l), 0);
    const purchaseCents = piLines.reduce((s, l) => s + Math.round((l.qty * l.costE4) / 100), 0);

    db.pis = [
      {
        id: piId,
        piNo: piNo.trim(),
        signedOn: today(),
        currency: q.currency,
        amountCents,
        // 单行就写品名，多行写「品名 等 N 项」—— 列表页那一列放不下三行品名
        product: piLines.length === 1 ? piLines[0].name : `${piLines[0].name} 等 ${piLines.length} 项`,
        destination: cust?.country ?? q.country,
        status: "open",
        customerId: q.customerId!,
        salesId: q.ownerId,
        sellerEntityId: q.sellerEntityId,
        quoteId: q.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      ...db.pis,
    ];
    db.piLines = [...db.piLines, ...piLines];
    db.costings = [
      {
        id: rid("cst"),
        piId,
        purchaseCostCents: purchaseCents,
        freightCents: q.calc.freightCents,
        customsCents: 0,
        bankCents: Math.round(((amountCents * q.calc.rateE6) / 1_000_000) * (q.calc.bankRateBp / 10_000)),
        otherCents: q.calc.localCents,
        receivableCents: 0,
        payableCents: purchaseCents,
        profitRateBp: 0,
        reviewState: "draft",
        settleState: "未完结",
        // 成本来自报价单的核算参数，是估的 —— 采购合同签下来才是实数
        costEstimated: true,
        updatedAt: nowIso(),
      },
      ...db.costings,
    ];
    db.presales = {
      ...db.presales,
      quotes: db.presales.quotes.map((x) => (x.id === quoteId ? { ...x, status: "converted", piId, updatedAt: nowIso() } : x)),
      inquiries: db.presales.inquiries.map((i) => (i.id === q.inquiryId ? { ...i, status: "won" } : i)),
    };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Pi", entityId: piId, entityLabel: piNo.trim(), action: "报价转 PI", before: null, after: JSON.stringify({ 报价单: `${q.quoteNo} v${q.version}`, 明细行: piLines.length, 金额: amountCents / 100 }) });
  });
  return { ok: true as const, id: piId };
}

/* ═══════════════════ 样品 ═══════════════════ */

export function createSample(actor: Actor, o: { inquiryId: string | null; customerId: string | null; company: string; country: string; productId: string | null; qty: number; fee: number; freightBy: string; ownerId: string | null }) {
  let id = "";
  mutate((db) => {
    id = rid("smp");
    const no = nextSampleNo(db);
    const prd = o.productId ? db.ops.products.find((p) => p.id === o.productId) : null;
    const row: SampleOrder = {
      id,
      sampleNo: no,
      inquiryId: o.inquiryId,
      customerId: o.customerId,
      company: o.company,
      country: o.country,
      productId: o.productId,
      productName: prd?.name ?? "—",
      qty: o.qty,
      feeCents: Math.round(o.fee * 100),
      freightBy: o.freightBy,
      courier: null,
      trackingNo: null,
      status: "requested",
      requestedOn: today(),
      sentOn: null,
      deliveredOn: null,
      followOn: null,
      feedback: null,
      ownerId: o.ownerId,
      note: null,
    };
    db.presales = { ...db.presales, samples: [row, ...db.presales.samples] };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Sample", entityId: id, entityLabel: no, action: "新建样品单", before: null, after: JSON.stringify({ 客户: o.company, 产品: row.productName }) });
  });
  return { ok: true as const, id };
}

export function patchSample(actor: Actor, id: string, patch: Partial<SampleOrder>) {
  mutate((db) => {
    const before = db.presales.samples.find((s) => s.id === id);
    db.presales = {
      ...db.presales,
      samples: db.presales.samples.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        /* 一寄出就自动定下该催的日子。
           指望业务员每次手工填一个提醒日期，等于这个字段永远是空的 ——
           而它空着，样品单就退化成一张只能事后翻的流水账。 */
        if (patch.sentOn && !s.sentOn && !next.followOn) {
          next.followOn = new Date(Date.parse(patch.sentOn) + 12 * 86_400_000).toISOString().slice(0, 10);
        }
        if (patch.deliveredOn && !s.deliveredOn) {
          next.followOn = new Date(Date.parse(patch.deliveredOn) + 5 * 86_400_000).toISOString().slice(0, 10);
        }
        return next;
      }),
    };
    if (before) {
      pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Sample", entityId: id, entityLabel: before.sampleNo, action: "更新样品单", before: JSON.stringify({ 状态: before.status }), after: JSON.stringify(patch) });
    }
  });
}

export type { Incoterm };

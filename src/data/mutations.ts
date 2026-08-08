/**
 * 写操作。三条纪律，跟原来的 Server Action 保持一致：
 *  1. 每次写入落一条 AuditLog —— 外贸单据必须留痕；
 *  2. 破坏性操作返回可以原样回灌的快照，5 秒内能撤销；
 *  3. 删除是软删（archived = true），不是真删。
 */

import { mutate, pushAudit } from "./db";
import type { Database, PiLine, ReleaseState, Shipment, ShipmentMilestone } from "./types";
import { lineAmount } from "./types";

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

export type Actor = { id: string | null; name: string };

// ───────────────────────── 跟单表 ─────────────────────────

export function updateNote(actor: Actor, shipmentId: string, body: string, happenedOn: string) {
  const text = body.trim();
  if (!text) return { ok: false as const, error: "动态不能为空" };

  mutate((db) => {
    const s = db.shipments.find((x) => x.id === shipmentId);
    if (!s) return;
    const before = { latestNote: s.latestNote, latestNoteOn: s.latestNoteOn };
    db.shipments = db.shipments.map((x) =>
      x.id === shipmentId ? { ...x, latestNote: text, latestNoteOn: happenedOn, updatedAt: nowIso() } : x,
    );
    // 动态是流水而不是单字段，这样才有历史可查；列表读的是冗余在批次上的那份
    db.notes = [
      { id: rid("not"), shipmentId, body: text, happenedOn, authorId: actor.id, createdAt: nowIso() },
      ...db.notes,
    ];
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: shipmentId,
      entityLabel: s.batchNo, action: "更新动态",
      before: JSON.stringify(before), after: JSON.stringify({ latestNote: text, latestNoteOn: happenedOn }),
    });
  });

  return { ok: true as const };
}

export type BulkPatch = { body?: string; happenedOn?: string; releaseState?: string; hasTodo?: boolean };
export type BulkUndo = Array<Pick<Shipment, "id" | "latestNote" | "latestNoteOn" | "releaseState" | "hasTodo">> & {
  noteIds?: string[];
};

export function bulkUpdate(actor: Actor, ids: string[], patch: BulkPatch) {
  if (!ids.length) return { ok: false as const, error: "没有选中任何批次" };
  const body = patch.body?.trim();
  if (!body && !patch.releaseState && patch.hasTodo === undefined) {
    return { ok: false as const, error: "写一条动态，或者选一个要改的状态" };
  }

  const undo: BulkUndo = [] as unknown as BulkUndo;
  const noteIds: string[] = [];

  mutate((db) => {
    const set = new Set(ids);
    const labels: string[] = [];
    db.shipments = db.shipments.map((s) => {
      if (!set.has(s.id)) return s;
      undo.push({ id: s.id, latestNote: s.latestNote, latestNoteOn: s.latestNoteOn, releaseState: s.releaseState, hasTodo: s.hasTodo });
      labels.push(s.batchNo);
      return {
        ...s,
        latestNote: body ? body : s.latestNote,
        latestNoteOn: body ? (patch.happenedOn ?? s.latestNoteOn) : s.latestNoteOn,
        releaseState: (patch.releaseState as ReleaseState) || s.releaseState,
        hasTodo: patch.hasTodo ?? s.hasTodo,
        updatedAt: nowIso(),
      };
    });

    if (body) {
      const fresh = ids.map((shipmentId) => {
        const id = rid("not");
        noteIds.push(id);
        return { id, shipmentId, body, happenedOn: patch.happenedOn ?? nowIso().slice(0, 10), authorId: actor.id, createdAt: nowIso() };
      });
      db.notes = [...fresh, ...db.notes];
    }

    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: ids[0],
      entityLabel: labels.length > 1 ? `${labels[0]} 等 ${labels.length} 个批次` : labels[0] ?? "—",
      action: "批量更新", before: null, after: JSON.stringify(patch),
    });
  });

  undo.noteIds = noteIds;
  return { ok: true as const, count: ids.length, undo };
}

export function revertBulk(snapshot: BulkUndo) {
  mutate((db) => {
    const map = new Map(snapshot.map((s) => [s.id, s]));
    db.shipments = db.shipments.map((s) => (map.has(s.id) ? { ...s, ...map.get(s.id)!, updatedAt: nowIso() } : s));
    if (snapshot.noteIds?.length) {
      const drop = new Set(snapshot.noteIds);
      db.notes = db.notes.filter((n) => !drop.has(n.id));
    }
    db.auditLogs = db.auditLogs.slice(1);
  });
}

export function setRelease(actor: Actor, id: string, releaseState: ReleaseState) {
  mutate((db) => {
    const s = db.shipments.find((x) => x.id === id);
    if (!s) return;
    db.shipments = db.shipments.map((x) => (x.id === id ? { ...x, releaseState, updatedAt: nowIso() } : x));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: id, entityLabel: s.batchNo,
      action: "修改放行状态", before: JSON.stringify({ releaseState: s.releaseState }), after: JSON.stringify({ releaseState }),
    });
  });
}

export function toggleTodo(actor: Actor, id: string, on: boolean) {
  mutate((db) => {
    const s = db.shipments.find((x) => x.id === id);
    if (!s) return;
    db.shipments = db.shipments.map((x) => (x.id === id ? { ...x, hasTodo: on, updatedAt: nowIso() } : x));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: id, entityLabel: s.batchNo,
      action: on ? "标记待办" : "销掉待办", before: JSON.stringify({ hasTodo: !on }), after: JSON.stringify({ hasTodo: on }),
    });
  });
}

/** 里程碑就地改：把某个节点的实际发生日填上或清掉 */
export function setMilestone(actor: Actor, shipmentId: string, kind: string, field: "plannedOn" | "actualOn", value: string | null) {
  mutate((db) => {
    const s = db.shipments.find((x) => x.id === shipmentId);
    const m = db.milestones.find((x) => x.shipmentId === shipmentId && x.kind === kind);
    if (!s || !m) return;
    db.milestones = db.milestones.map((x) => (x.id === m.id ? { ...x, [field]: value } : x));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "ShipmentMilestone", entityId: m.id, entityLabel: `${s.batchNo} · ${kind}`,
      action: field === "actualOn" ? "确认实际日期" : "调整计划日期",
      before: JSON.stringify({ [field]: m[field] }), after: JSON.stringify({ [field]: value }),
    });
  });
}

export function archiveShipment(actor: Actor, id: string) {
  let batchNo = "";
  mutate((db) => {
    const s = db.shipments.find((x) => x.id === id);
    if (!s) return;
    batchNo = s.batchNo;
    db.shipments = db.shipments.map((x) => (x.id === id ? { ...x, archived: true, updatedAt: nowIso() } : x));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: id, entityLabel: s.batchNo,
      action: "删除批次", before: JSON.stringify({ archived: false }), after: JSON.stringify({ archived: true }),
    });
  });
  return { ok: true as const, batchNo };
}

export function restoreShipment(id: string) {
  mutate((db) => {
    db.shipments = db.shipments.map((x) => (x.id === id ? { ...x, archived: false, updatedAt: nowIso() } : x));
    db.auditLogs = db.auditLogs.slice(1);
  });
}

export type NewShipmentInput = {
  batchNo: string;
  batchLabel?: string;
  piId: string | null;
  country: string;
  term: string;
  mode: Shipment["mode"];
  fcl: boolean;
  pod?: string;
  carrier?: string;
  containerNo?: string;
  salesId: string | null;
  team: string | null;
  deliveryOn?: string;
  note?: string;
};

export function createShipment(actor: Actor, input: NewShipmentInput) {
  if (!input.batchNo.trim()) return { ok: false as const, error: "批次号不能为空" };
  let dup = false;
  let id = "";
  mutate((db) => {
    if (db.shipments.some((s) => s.batchNo === input.batchNo.trim())) {
      dup = true;
      return;
    }
    id = rid("shp");
    const kinds: ShipmentMilestone["kind"][] = input.fcl ? ["交期", "装柜", "ATD", "ETA"] : ["交期", "装柜", "进仓", "ATD", "ETA"];
    db.shipments = [
      {
        id,
        batchNo: input.batchNo.trim(),
        batchLabel: input.batchLabel?.trim() || null,
        country: input.country,
        term: input.term,
        mode: input.mode,
        fcl: input.fcl,
        containerNo: input.containerNo?.trim() || null,
        carrier: input.carrier?.trim() || null,
        pod: input.pod?.trim() || null,
        releaseState: "未放行",
        team: input.team,
        latestNote: input.note?.trim() || null,
        latestNoteOn: input.note?.trim() ? nowIso().slice(0, 10) : null,
        hasTodo: false,
        archived: false,
        piId: input.piId,
        salesId: input.salesId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      ...db.shipments,
    ];
    db.milestones = [
      ...kinds.map((kind, seq) => ({
        id: rid("mst"),
        shipmentId: id,
        kind,
        seq,
        plannedOn: kind === "交期" ? (input.deliveryOn ?? null) : null,
        actualOn: null,
      })),
      ...db.milestones,
    ];
    if (input.note?.trim()) {
      db.notes = [{ id: rid("not"), shipmentId: id, body: input.note.trim(), happenedOn: nowIso().slice(0, 10), authorId: actor.id, createdAt: nowIso() }, ...db.notes];
    }
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Shipment", entityId: id, entityLabel: input.batchNo.trim(),
      action: "新增批次", before: null, after: JSON.stringify({ batchNo: input.batchNo, country: input.country }),
    });
  });
  if (dup) return { ok: false as const, error: `批次号 ${input.batchNo} 已经存在` };
  return { ok: true as const, id };
}

// ───────────────────────── 退税 ─────────────────────────

export function linkInvoice(actor: Actor, invoiceId: string, piId: string | null) {
  let before: string | null = null;
  mutate((db) => {
    const t = db.taxInvoices.find((x) => x.id === invoiceId);
    if (!t) return;
    before = t.piId;
    db.taxInvoices = db.taxInvoices.map((x) => (x.id === invoiceId ? { ...x, piId } : x));
    const piNo = piId ? db.pis.find((p) => p.id === piId)?.piNo : null;
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "TaxInvoice", entityId: invoiceId, entityLabel: t.invoiceNo,
      action: piId ? "关联订单" : "解除关联", before: JSON.stringify({ piId: before }), after: JSON.stringify({ piId, piNo }),
    });
  });
  return { ok: true as const, before };
}

// ───────────────────────── 订单核算 ─────────────────────────

export function updateCosting(
  actor: Actor,
  piId: string,
  patch: Partial<{ purchaseCostCents: number; freightCents: number; customsCents: number; bankCents: number; otherCents: number; receivableCents: number; payableCents: number; settleState: string; reviewState: string; costEstimated: boolean }>,
) {
  mutate((db) => {
    const c = db.costings.find((x) => x.piId === piId);
    const p = db.pis.find((x) => x.id === piId);
    if (!c || !p) return;
    const next = { ...c, ...patch, updatedAt: nowIso() };
    // 成本一改，利润率跟着重算：(订单额 − 全部成本) / 订单额，人民币成本按自定汇率折美元
    const rate = (db.fxRates.find((f) => f.kind === "custom")?.rateE6 ?? 6_700_000) / 1_000_000;
    const cost = (next.purchaseCostCents + next.freightCents + next.customsCents + next.bankCents + next.otherCents) / rate;
    next.profitRateBp = p.amountCents > 0 ? Math.round(((p.amountCents - cost) / p.amountCents) * 10_000) : 0;
    db.costings = db.costings.map((x) => (x.piId === piId ? next : x));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "OrderCosting", entityId: c.id, entityLabel: p.piNo,
      action: "更新核算", before: JSON.stringify({ profitRateBp: c.profitRateBp }), after: JSON.stringify({ profitRateBp: next.profitRateBp, ...patch }),
    });
  });
}

// ───────────────────────── PI 取号 ─────────────────────────

/** 号段规则：MT + 两位年 + X + 五位流水，取号即建档 */
export function nextPiNo(db: Database) {
  const yy = String(new Date().getFullYear()).slice(2);
  const prefix = `MT${yy}X`;
  const used = db.pis.filter((p) => p.piNo.startsWith(prefix)).map((p) => Number(p.piNo.slice(prefix.length)) || 0);
  const next = (used.length ? Math.max(...used) : 5000) + 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export function createPi(
  actor: Actor,
  input: { piNo: string; customerId: string; salesId: string | null; sellerEntityId: string | null; amount: number; currency: string; product: string; signedOn: string },
) {
  if (!input.piNo.trim()) return { ok: false as const, error: "PI 号不能为空" };
  if (!input.customerId) return { ok: false as const, error: "先选一个客户" };
  let dup = false;
  let id = "";
  mutate((db) => {
    if (db.pis.some((p) => p.piNo === input.piNo.trim())) {
      dup = true;
      return;
    }
    id = rid("pi");
    const cust = db.customers.find((c) => c.id === input.customerId);
    db.pis = [
      {
        id,
        piNo: input.piNo.trim(),
        signedOn: input.signedOn,
        currency: input.currency,
        amountCents: Math.round(input.amount * 100),
        product: input.product.trim() || null,
        destination: cust?.country ?? null,
        status: "open",
        customerId: input.customerId,
        salesId: input.salesId,
        sellerEntityId: input.sellerEntityId,
        quoteId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      ...db.pis,
    ];
    db.costings = [
      {
        id: rid("cst"), piId: id, purchaseCostCents: 0, freightCents: 0, customsCents: 0, bankCents: 0,
        otherCents: 0, receivableCents: 0, payableCents: 0, profitRateBp: 0,
        reviewState: "draft", settleState: "未完结", costEstimated: false, updatedAt: nowIso(),
      },
      ...db.costings,
    ];
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "Pi", entityId: id, entityLabel: input.piNo.trim(),
      action: "PI 取号", before: null, after: JSON.stringify({ piNo: input.piNo, amount: input.amount }),
    });
  });
  if (dup) return { ok: false as const, error: `PI 号 ${input.piNo} 已经存在` };
  return { ok: true as const, id };
}

// ───────────────────────── PI 商品明细行 ─────────────────────────

/**
 * 明细行改了，PI 金额跟着重算。
 *
 * `Pi.amountCents` 是**明细行合计的缓存**，不是另一个真相。
 * 单据上打的合计、订单页看到的金额、收款进度的分母必须是同一个数 ——
 * 允许它们分头维护，迟早会出现"发票上写 19,224，系统里显示 19,180"。
 */
function resyncPiAmount(db: Database, piId: string) {
  const total = db.piLines.filter((l) => l.piId === piId).reduce((s, l) => s + lineAmount(l), 0);
  db.pis = db.pis.map((p) => (p.id === piId ? { ...p, amountCents: total, updatedAt: nowIso() } : p));
}

export function addPiLine(actor: Actor, piId: string, productId: string | null) {
  mutate((db) => {
    const prd = productId ? db.ops.products.find((p) => p.id === productId) : null;
    const seq = db.piLines.filter((l) => l.piId === piId).length + 1;
    db.piLines = [
      ...db.piLines,
      {
        id: rid("pil"),
        piId,
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
      },
    ];
    resyncPiAmount(db, piId);
    const pi = db.pis.find((p) => p.id === piId);
    if (pi) pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Pi", entityId: piId, entityLabel: pi.piNo, action: "新增明细行", before: null, after: JSON.stringify({ 品名: prd?.name ?? "空行" }) });
  });
}

export function patchPiLine(id: string, patch: Partial<PiLine>) {
  mutate((db) => {
    const line = db.piLines.find((l) => l.id === id);
    if (!line) return;
    db.piLines = db.piLines.map((l) => (l.id === id ? { ...l, ...patch } : l));
    resyncPiAmount(db, line.piId);
  });
}

export function removePiLine(actor: Actor, id: string) {
  mutate((db) => {
    const line = db.piLines.find((l) => l.id === id);
    if (!line) return;
    db.piLines = db.piLines.filter((l) => l.id !== id).map((l) => (l.piId === line.piId && l.seq > line.seq ? { ...l, seq: l.seq - 1 } : l));
    resyncPiAmount(db, line.piId);
    const pi = db.pis.find((p) => p.id === line.piId);
    if (pi) pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Pi", entityId: line.piId, entityLabel: pi.piNo, action: "删除明细行", before: JSON.stringify({ 品名: line.name }), after: null });
  });
}

/** PI 上的自定义字段（唛头之类） */
export function setPiExt(piId: string, key: string, value: string) {
  mutate((db) => {
    db.pis = db.pis.map((p) => (p.id === piId ? { ...p, ext: { ...(p.ext ?? {}), [key]: value } } : p));
  });
}

// ───────────────────────── 保存的视图 ─────────────────────────

export function saveView(module: string, name: string, query: string) {
  let id = "";
  mutate((db) => {
    id = rid("vw");
    db.savedViews = [{ id, module, name, query, createdAt: nowIso() }, ...db.savedViews.filter((v) => !(v.module === module && v.name === name))];
  });
  return id;
}

export function deleteView(id: string) {
  mutate((db) => {
    db.savedViews = db.savedViews.filter((v) => v.id !== id);
  });
}

// ───────────────────────── 汇率 ─────────────────────────

export function setCustomRate(actor: Actor, rate: number) {
  mutate((db) => {
    const e6 = Math.round(rate * 1_000_000);
    const cur = db.fxRates.find((f) => f.kind === "custom");
    db.fxRates = db.fxRates.map((f) => (f.kind === "custom" ? { ...f, rateE6: e6, asOf: nowIso() } : f));
    pushAudit(db, {
      actorId: actor.id, actorName: actor.name, entity: "FxRate", entityId: cur?.id ?? "custom", entityLabel: "自定汇率",
      action: "修改自定汇率", before: JSON.stringify({ rate: (cur?.rateE6 ?? 0) / 1e6 }), after: JSON.stringify({ rate }),
    });
  });
}

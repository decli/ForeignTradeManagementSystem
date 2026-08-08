/**
 * 审批 / 通知 / 往来的写操作。
 */

import { mutate, pushAudit } from "./db";
import type { Actor } from "./mutations";
import type { ApprovalRequest, ApprovalRule, CustomFieldDef, Message, Notification } from "./flow-types";
import type { Database } from "./types";

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

/* ═══════════════════ 审批 ═══════════════════ */

function pushNotice(db: Database, n: Omit<Notification, "id" | "at">) {
  db.flow = { ...db.flow, notifications: [{ ...n, id: rid("nt"), at: nowIso() }, ...db.flow.notifications].slice(0, 200) };
}

export function submitApproval(
  actor: Actor,
  o: { kind: string; entity: string; entityId: string; entityLabel: string; summary: string; amount: number; currency: string; reason: string },
) {
  let id = "";
  let err = "";
  mutate((db) => {
    const rule = db.flow.approvalRules.find((r) => r.kind === o.kind && r.enabled);
    if (!rule || !rule.approverIds.length) {
      err = "这类审批还没配审批人，去系统设置里配一下";
      return;
    }
    if (db.flow.approvals.some((a) => a.entityId === o.entityId && a.kind === o.kind && a.status === "pending")) {
      err = "这张单已经有一笔同类审批在走了";
      return;
    }
    id = rid("ap");
    const yy = String(new Date().getFullYear()).slice(2);
    const used = db.flow.approvals.map((a) => Number(a.requestNo.slice(-3)) || 0);
    const row: ApprovalRequest = {
      id,
      requestNo: `AP${yy}${(used.length ? Math.max(...used) : 500) + 1}`,
      kind: o.kind,
      entity: o.entity,
      entityId: o.entityId,
      entityLabel: o.entityLabel,
      summary: o.summary,
      amount: o.amount,
      currency: o.currency,
      requesterId: actor.id,
      requesterName: actor.name,
      reason: o.reason.trim() || null,
      status: "pending",
      steps: rule.approverIds.map((uid) => ({
        approverId: uid,
        approverName: db.users.find((u) => u.id === uid)?.name ?? "—",
        state: "pending",
        at: null,
        comment: null,
      })),
      cursor: 0,
      createdAt: nowIso(),
      closedAt: null,
    };
    db.flow = { ...db.flow, approvals: [row, ...db.flow.approvals] };
    pushNotice(db, { kind: "approval", userId: row.steps[0].approverId, title: "有一笔审批等你", body: row.summary, href: `/approvals?id=${id}`, read: false });
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Approval", entityId: id, entityLabel: row.requestNo, action: "提交审批", before: null, after: JSON.stringify({ 类型: o.kind, 单据: o.entityLabel }) });
  });
  return err ? { ok: false as const, error: err } : { ok: true as const, id };
}

/**
 * 审一笔。
 *
 * 多级审批下，通过就往后走一步，走完最后一级才算通过；
 * **驳回一步到位** —— 没有"一级驳回、二级还能救"这回事，
 * 那会让被驳回的人不知道该找谁。
 */
export function decideApproval(actor: Actor, id: string, ok: boolean, comment: string) {
  let err = "";
  mutate((db) => {
    const a = db.flow.approvals.find((x) => x.id === id);
    if (!a || a.status !== "pending") {
      err = "这笔审批已经结了";
      return;
    }
    const step = a.steps[a.cursor];
    if (!step || step.approverId !== actor.id) {
      err = "现在不轮到你审";
      return;
    }
    const steps = a.steps.map((s, i) => (i === a.cursor ? { ...s, state: ok ? "approved" : "rejected", at: nowIso(), comment: comment.trim() || null } : s));
    const last = a.cursor >= a.steps.length - 1;
    const next: ApprovalRequest = {
      ...a,
      steps,
      cursor: ok && !last ? a.cursor + 1 : a.cursor,
      status: ok ? (last ? "approved" : "pending") : "rejected",
      closedAt: ok && !last ? null : nowIso(),
    };
    db.flow = { ...db.flow, approvals: db.flow.approvals.map((x) => (x.id === id ? next : x)) };

    if (next.status === "pending") {
      pushNotice(db, { kind: "approval", userId: steps[next.cursor].approverId, title: "有一笔审批等你", body: a.summary, href: `/approvals?id=${id}`, read: false });
    } else {
      pushNotice(db, {
        kind: "approval",
        userId: a.requesterId,
        title: ok ? "你的审批通过了" : "你的审批被驳回",
        body: `${a.requestNo} · ${a.summary}${comment.trim() ? ` — ${comment.trim()}` : ""}`,
        href: `/approvals?id=${id}`,
        read: false,
      });
    }
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Approval", entityId: id, entityLabel: a.requestNo, action: ok ? "审批通过" : "审批驳回", before: JSON.stringify({ 状态: "待审批" }), after: JSON.stringify({ 状态: next.status, 批语: comment }) });
  });
  return err ? { ok: false as const, error: err } : { ok: true as const };
}

export function withdrawApproval(actor: Actor, id: string) {
  mutate((db) => {
    const a = db.flow.approvals.find((x) => x.id === id);
    if (!a || a.status !== "pending") return;
    db.flow = {
      ...db.flow,
      approvals: db.flow.approvals.map((x) => (x.id === id ? { ...x, status: "withdrawn", closedAt: nowIso() } : x)),
    };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Approval", entityId: id, entityLabel: a.requestNo, action: "撤回审批", before: null, after: null });
  });
}

export function patchRule(id: string, patch: Partial<ApprovalRule>) {
  mutate((db) => {
    db.flow = { ...db.flow, approvalRules: db.flow.approvalRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
  });
}

/* ═══════════════════ 通知 ═══════════════════ */

export function markRead(ids: string[]) {
  mutate((db) => {
    const set = new Set(ids);
    db.flow = { ...db.flow, notifications: db.flow.notifications.map((n) => (set.has(n.id) ? { ...n, read: true } : n)) };
  });
}

export function markAllRead(userId: string | null) {
  mutate((db) => {
    db.flow = {
      ...db.flow,
      notifications: db.flow.notifications.map((n) => (n.userId === null || n.userId === userId ? { ...n, read: true } : n)),
    };
  });
}

/* ═══════════════════ 往来沟通 ═══════════════════ */

export function logMessage(actor: Actor, o: Omit<Message, "id" | "userId" | "userName" | "externalId" | "attachmentIds">) {
  let id = "";
  mutate((db) => {
    id = rid("msg");
    const row: Message = { ...o, id, userId: actor.id, userName: actor.name, externalId: null, attachmentIds: [] };
    db.flow = { ...db.flow, messages: [row, ...db.flow.messages] };
    pushAudit(db, { actorId: actor.id, actorName: actor.name, entity: "Message", entityId: id, entityLabel: o.subject.slice(0, 30), action: "归档往来", before: null, after: JSON.stringify({ 渠道: o.channel, 方向: o.direction }) });
  });
  return id;
}

export function deleteMessage(id: string) {
  mutate((db) => {
    db.flow = { ...db.flow, messages: db.flow.messages.filter((m) => m.id !== id) };
  });
}

/* ═══════════════════ 自定义字段 ═══════════════════ */

export function addCustomField(def: Omit<CustomFieldDef, "id">) {
  let err = "";
  mutate((db) => {
    if (db.flow.customFields.some((f) => f.entity === def.entity && f.key === def.key)) {
      err = `这个实体下已经有一个键叫 ${def.key} 了`;
      return;
    }
    db.flow = { ...db.flow, customFields: [...db.flow.customFields, { ...def, id: rid("cf") }] };
  });
  return err ? { ok: false as const, error: err } : { ok: true as const };
}

export function patchCustomField(id: string, patch: Partial<CustomFieldDef>) {
  mutate((db) => {
    // key 定了就不给改：改了历史值全部对不上，而旧值还在 ext 里躺着
    const { key: _dropKey, ...safe } = patch;
    db.flow = { ...db.flow, customFields: db.flow.customFields.map((f) => (f.id === id ? { ...f, ...safe } : f)) };
  });
}

export function removeCustomField(id: string) {
  mutate((db) => {
    db.flow = { ...db.flow, customFields: db.flow.customFields.filter((f) => f.id !== id) };
  });
}

/** 给一条记录写自定义字段的值 */
export function setExt(entity: "customer" | "pi", id: string, key: string, value: string) {
  mutate((db) => {
    if (entity === "customer") {
      db.customers = db.customers.map((c) => (c.id === id ? { ...c, ext: { ...(c.ext ?? {}), [key]: value } } : c));
    } else {
      db.pis = db.pis.map((p) => (p.id === id ? { ...p, ext: { ...(p.ext ?? {}), [key]: value } } : p));
    }
  });
}

"use server";

// 注意：这里不调用 revalidatePath。
// 它会让客户端按「规范路径」重新取数，把用户通过 router.replace 加上去的查询参数
// 丢掉——表现就是筛完之后随便改一条数据，筛选条件自己复位了。
// 改由调用方在写成功后 router.refresh()，那个是按当前 URL（含查询串）刷新的。

import { db } from "@/lib/db";

/** TODO(M1): 接入登录后换成当前 session 用户 */
async function currentUserId() {
  const u = await db.user.findFirst({ where: { role: "admin" } });
  return u?.id ?? null;
}

async function audit(
  actorId: string | null,
  entity: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.auditLog.create({
    data: {
      actorId,
      entity,
      entityId,
      action,
      before: before === undefined ? null : JSON.stringify(before),
      after: after === undefined ? null : JSON.stringify(after),
    },
  });
}

function parseDay(value: string | null | undefined) {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** 更新单个批次的最新动态。动态写成流水，同时冗余一份到批次上供列表页读取。 */
export async function updateNote(shipmentId: string, body: string, happenedOn?: string) {
  const text = body.trim();
  if (!text) return { ok: false as const, error: "动态不能为空" };

  const actorId = await currentUserId();
  const before = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { latestNote: true, latestNoteOn: true },
  });
  if (!before) return { ok: false as const, error: "批次不存在" };

  const on = parseDay(happenedOn);

  await db.$transaction([
    db.shipmentNote.create({ data: { shipmentId, body: text, happenedOn: on, authorId: actorId } }),
    db.shipment.update({
      where: { id: shipmentId },
      data: { latestNote: text, latestNoteOn: on },
    }),
  ]);
  await audit(actorId, "Shipment", shipmentId, "note.update", before, { latestNote: text, latestNoteOn: on });

  return { ok: true as const };
}

/** 批量更新：一次写完动态 + 日期 + 放行状态。返回改动前的值供撤销。 */
export async function bulkUpdate(
  ids: string[],
  input: { body?: string; happenedOn?: string; releaseState?: string },
) {
  if (ids.length === 0) return { ok: false as const, error: "没有选中任何批次" };
  const text = input.body?.trim();
  const rel = input.releaseState?.trim();
  if (!text && !rel) return { ok: false as const, error: "先写一条动态，或选一个放行状态" };

  const actorId = await currentUserId();
  const before = await db.shipment.findMany({
    where: { id: { in: ids } },
    select: { id: true, latestNote: true, latestNoteOn: true, releaseState: true },
  });

  const on = parseDay(input.happenedOn);

  await db.$transaction(async (tx) => {
    for (const id of ids) {
      if (text) {
        await tx.shipmentNote.create({
          data: { shipmentId: id, body: text, happenedOn: on, authorId: actorId },
        });
      }
      await tx.shipment.update({
        where: { id },
        data: {
          ...(text ? { latestNote: text, latestNoteOn: on } : {}),
          ...(rel ? { releaseState: rel } : {}),
        },
      });
    }
  });

  for (const b of before) {
    await audit(actorId, "Shipment", b.id, "bulk.update", b, {
      ...(text ? { latestNote: text, latestNoteOn: on } : {}),
      ...(rel ? { releaseState: rel } : {}),
    });
  }

  return {
    ok: true as const,
    count: ids.length,
    undo: before.map((b) => ({
      id: b.id,
      latestNote: b.latestNote,
      latestNoteOn: b.latestNoteOn ? b.latestNoteOn.toISOString().slice(0, 10) : null,
      releaseState: b.releaseState,
    })),
  };
}

/** 撤销批量更新：把改动前的值写回去 */
export async function revertBulk(
  snapshot: { id: string; latestNote: string | null; latestNoteOn: string | null; releaseState: string }[],
) {
  const actorId = await currentUserId();
  await db.$transaction(
    snapshot.map((s) =>
      db.shipment.update({
        where: { id: s.id },
        data: {
          latestNote: s.latestNote,
          latestNoteOn: s.latestNoteOn ? parseDay(s.latestNoteOn) : null,
          releaseState: s.releaseState,
        },
      }),
    ),
  );
  for (const s of snapshot) await audit(actorId, "Shipment", s.id, "bulk.revert", null, s);

  return { ok: true as const };
}

/**
 * 「删除」是软删除：置 archived，行从列表消失但数据留着。
 * 外贸单据要留痕，硬删除既不合规也没法撤销。
 */
export async function archiveShipment(id: string) {
  const actorId = await currentUserId();
  const before = await db.shipment.findUnique({ where: { id }, select: { batchNo: true, archived: true } });
  if (!before) return { ok: false as const, error: "批次不存在" };

  await db.shipment.update({ where: { id }, data: { archived: true } });
  await audit(actorId, "Shipment", id, "archive", before, { archived: true });

  return { ok: true as const, batchNo: before.batchNo };
}

export async function restoreShipment(id: string) {
  const actorId = await currentUserId();
  await db.shipment.update({ where: { id }, data: { archived: false } });
  await audit(actorId, "Shipment", id, "restore", { archived: true }, { archived: false });

  return { ok: true as const };
}

export async function toggleTodo(id: string, value: boolean) {
  const actorId = await currentUserId();
  await db.shipment.update({ where: { id }, data: { hasTodo: value } });
  await audit(actorId, "Shipment", id, "todo.toggle", null, { hasTodo: value });
  return { ok: true as const };
}

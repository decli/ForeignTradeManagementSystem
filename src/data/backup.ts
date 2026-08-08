/**
 * 本地自动备份。
 *
 * ── 为什么这件事优先级很高 ──
 * 整个账套存在浏览器里。用户"清理浏览数据"一下，三年台账就没了 ——
 * 老板可以接受功能少，不能接受账没了。在没有服务端的前提下，
 * 能做的就是：**在同一台机器上多留几份，并且让用户看得见、回得去**。
 *
 * ── 它挡得住什么、挡不住什么 ──
 * 挡得住：误删一批数据、导错一次 Excel、改崩一张表。
 * 挡不住：换电脑、清空站点数据、硬盘坏。所以设置页里同时写着
 * "定期导出 JSON 存到网盘"—— 这句话不是免责声明，是操作建议。
 *
 * ── 为什么按天保留而不是按次 ──
 * 每次写入都存一份，配额几分钟就满，而且十份都是同一分钟的数据，
 * 回滚时根本挑不出想要的那份。这里保留最近 7 个"节点"，
 * 同一天内只更新当天那一份 —— 想回到的通常是"昨天那个样子"。
 */

import { snapDel, snapGet, snapKeys, snapPut, storageEstimate } from "./idb";
import type { Database } from "./types";

const PREFIX = "snap_";
/** 保留几份。7 份覆盖一周，配额压力也还行 */
const KEEP = 7;
/** 迁移前的备份单独留几份，不跟日常备份抢名额 */
const KEEP_MIGRATE = 3;

/** manual = 手工点的；auto = 每天自动；migrate = 升级结构之前 */
export type SnapshotBy = "auto" | "manual" | "migrate";

export type SnapshotMeta = {
  key: string;
  /** 备份时刻 */
  at: string;
  /** 那一刻账套里有多少张单据，用来判断"这份是不是我要的" */
  counts: { pis: number; shipments: number; customers: number; payments: number };
  /** 序列化后的大概字节数 */
  bytes: number;
  by: SnapshotBy;
  /** migrate 专用：从哪个结构版本升上来的 */
  fromVersion?: number;
};

type Envelope = { meta: SnapshotMeta; db: Database };

const dayKey = (d = new Date()) => `${PREFIX}${d.toISOString().slice(0, 10)}`;

function countsOf(db: Database) {
  return {
    pis: db.pis.length,
    shipments: db.shipments.length,
    customers: db.customers.length,
    payments: db.ops.payments.length,
  };
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    const keys = (await snapKeys()).filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX));
    const rows = await Promise.all(keys.map((k) => snapGet<Envelope>(k)));
    return rows
      .map((r) => r?.meta)
      .filter((m): m is SnapshotMeta => !!m)
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

/**
 * 存一份。同一天重复调用会覆盖当天那份 —— 一天一个节点。
 * 口令摘要不进备份：它属于这台机器上的这个人，跟业务数据不是一回事。
 */
export async function takeSnapshot(db: Database, by: SnapshotBy = "manual", fromVersion?: number) {
  const { credentials: _drop, ...rest } = db;
  const body = rest as Database;
  /* 迁移前那一份不能占用当天的槽位 —— 否则同一天的日常备份会把它盖掉，
     而它恰恰是"升级把我搞砸了"唯一的退路 */
  const key = by === "migrate" ? `${PREFIX}migrate-${new Date().toISOString().replace(/[:.]/g, "-")}` : dayKey();
  const meta: SnapshotMeta = {
    key,
    at: new Date().toISOString(),
    counts: countsOf(db),
    bytes: JSON.stringify(body).length,
    by,
    ...(fromVersion == null ? {} : { fromVersion }),
  };
  await snapPut(meta.key, { meta, db: body } satisfies Envelope);
  await prune();
  return meta;
}

/** 两条独立的保留线：日常备份留 7 份，迁移备份另外留 3 份，互不挤占 */
async function prune() {
  const all = await listSnapshots();
  const keep = new Set<string>();
  for (const m of all.filter((x) => x.by === "migrate").slice(0, KEEP_MIGRATE)) keep.add(m.key);
  for (const m of all.filter((x) => x.by !== "migrate").slice(0, KEEP)) keep.add(m.key);
  for (const m of all) if (!keep.has(m.key)) await snapDel(m.key).catch(() => undefined);
}

export async function readSnapshot(key: string) {
  const env = await snapGet<Envelope>(key);
  return env?.db ?? null;
}

export async function dropSnapshot(key: string) {
  await snapDel(key).catch(() => undefined);
}

/**
 * 启动时的自动备份。
 *
 * 只有"今天还没备过"才动手，而且**先备份再让用户开始改** ——
 * 备份的价值全在于它反映的是"我搞砸之前"的状态。
 * 任何一步失败都静默吞掉：备份是保险，不能反过来把主流程拖崩。
 */
export async function autoSnapshot(db: Database) {
  try {
    const existing = await snapGet<Envelope>(dayKey());
    if (existing) return null;
    return await takeSnapshot(db, "auto");
  } catch {
    return null;
  }
}

export { storageEstimate };

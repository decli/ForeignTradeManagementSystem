/**
 * 「账套还安不安全」的唯一判断处。
 *
 * 设置页的存储卡片和顶部横幅问的是同一个问题，答案必须一致 ——
 * 阈值散在两个地方，早晚会变成"卡片说没事、横幅在报警"。
 *
 * ── 这里刻意不做的事 ──
 * 不把 `persist()` 已授予当成"安全了"。它挡得住浏览器主动回收，
 * 挡不住用户手动清站点数据、换电脑、硬盘坏。**唯一真正的保险是导出文件**，
 * 所以「多久没导出」在任何情况下都参与判断。
 */

import { isPersisted, storageEstimate } from "@/data/idb";

/** 超过这么多天没导出就该提醒了。一周是个大多数人能接受的节奏 */
const EXPORT_STALE_DAYS = 7;
/** 配额用到这个比例就要警告 —— 写满之后备份会先失败，而且是静默的 */
const QUOTA_WARN = 0.8;

export type StorageHealth = {
  /** true = 已授予；false = 支持但没给；null = 浏览器没有这个 API */
  persisted: boolean | null;
  used: number;
  quota: number;
  /** 0–1；quota 为 0（拿不到）时是 null */
  usedRatio: number | null;
  lastExportAt: string | null;
  /** 距上次导出多少天。从未导出 = null */
  daysSinceExport: number | null;
  /** 有没有到该打扰用户的程度 */
  atRisk: boolean;
  /** 为什么有风险。按严重程度排，第一条就是横幅要说的话 */
  reasons: StorageRisk[];
};

export type StorageRisk = "quota" | "never-exported" | "stale-export" | "not-persisted";

export async function readStorageHealth(lastExportAt: string | null, now = new Date()): Promise<StorageHealth> {
  const [persisted, est] = await Promise.all([isPersisted(), storageEstimate()]);
  const used = est?.used ?? 0;
  const quota = est?.quota ?? 0;
  const usedRatio = quota > 0 ? used / quota : null;

  const daysSinceExport = lastExportAt
    ? Math.floor((now.getTime() - new Date(lastExportAt).getTime()) / 86_400_000)
    : null;

  const reasons: StorageRisk[] = [];
  // 配额排第一：它会让备份和附件静默写失败，比"可能被清"更迫在眉睫
  if (usedRatio != null && usedRatio > QUOTA_WARN) reasons.push("quota");
  if (lastExportAt === null) reasons.push("never-exported");
  else if ((daysSinceExport ?? 0) > EXPORT_STALE_DAYS) reasons.push("stale-export");
  // 没拿到持久化只在"也没导出过"的前提下才算风险，单独出现不值得打扰
  if (persisted === false && reasons.length) reasons.push("not-persisted");

  return {
    persisted,
    used,
    quota,
    usedRatio,
    lastExportAt,
    daysSinceExport,
    atRisk: reasons.length > 0,
    reasons,
  };
}

export { EXPORT_STALE_DAYS, QUOTA_WARN };

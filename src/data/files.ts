/**
 * 附件。
 *
 * 元信息（谁传的、多大、什么单据）跟着账套走，进 `Database.attachments`；
 * 文件本体进 IndexedDB 的 files store，只留一个键。理由见 idb.ts。
 *
 * ── 接后端从哪改 ──
 * 只有 `putBlob` / `getBlob` / `dropBlob` 三个出口碰存储。换成对象存储时
 * 把它们改成签名 URL 的上传下载即可，`blobKey` 原样当远端 key 用，
 * 上层组件（Attachments.tsx）一行不动。
 */

import { fileDel, fileGet, filePut } from "./idb";
import { mutate, pushAudit, snapshot } from "./db";
import type { Attachment, Database } from "./types";
import type { Actor } from "./mutations";

/** 单个文件上限。浏览器配额是共享的，一份 50MB 的视频能把整个账套挤没 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 单据类型。做齐套检查和分组用 */
export const ATTACH_KINDS = ["合同 / PI", "商业发票", "装箱单", "提单", "产地证", "水单 / 回单", "报关单", "验货报告", "认证资质", "唛头 / 图纸", "其他"] as const;

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export const putBlob = (key: string, blob: Blob) => filePut(key, blob);
export const getBlob = (key: string) => fileGet(key);
export const dropBlob = (key: string) => fileDel(key);

export function listAttachments(db: Database, entity: string, entityId: string) {
  return db.attachments
    .filter((a) => a.entity === entity && a.entityId === entityId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export const attachmentCount = (db: Database, entity: string, entityId: string) =>
  db.attachments.reduce((n, a) => (a.entity === entity && a.entityId === entityId ? n + 1 : n), 0);

/**
 * 传一个文件。
 *
 * 先写本体再写元信息 —— 反过来的话，本体写失败会留下一条指向空气的记录，
 * 列表上就多了一个永远打不开的附件。
 */
export async function uploadFile(
  actor: Actor,
  entity: string,
  entityId: string,
  entityLabel: string,
  file: File,
  kind: string,
) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB，换个小一点的`);
  }
  const blobKey = rid("blob");
  await putBlob(blobKey, file);

  const row: Attachment = {
    id: rid("att"),
    entity,
    entityId,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    blobKey,
    placeholder: false,
    kind,
    uploadedBy: actor.id,
    uploaderName: actor.name,
    uploadedAt: new Date().toISOString(),
    note: null,
  };

  mutate((d) => {
    d.attachments = [row, ...d.attachments];
    pushAudit(d, {
      actorId: actor.id,
      actorName: actor.name,
      entity,
      entityId,
      entityLabel,
      action: "上传附件",
      before: null,
      after: JSON.stringify({ 文件: file.name, 类型: kind }),
    });
  });
  return row;
}

export async function removeAttachment(actor: Actor, id: string, entityLabel: string) {
  const row = snapshot().attachments.find((a) => a.id === id);
  if (!row) return;
  if (row.blobKey) await dropBlob(row.blobKey).catch(() => undefined);
  mutate((d) => {
    d.attachments = d.attachments.filter((a) => a.id !== id);
    pushAudit(d, {
      actorId: actor.id,
      actorName: actor.name,
      entity: row.entity,
      entityId: row.entityId,
      entityLabel,
      action: "删除附件",
      before: JSON.stringify({ 文件: row.name }),
      after: null,
    });
  });
}

export function renameAttachmentKind(id: string, kind: string) {
  mutate((d) => {
    d.attachments = d.attachments.map((a) => (a.id === id ? { ...a, kind } : a));
  });
}

/**
 * 下载。
 *
 * 演示账套里的占位附件没有本体 —— 直接抛出说明，不要弹一个 0 字节的文件
 * 让人以为是系统坏了。
 */
export async function downloadAttachment(a: Attachment) {
  if (!a.blobKey || a.placeholder) {
    throw new Error("这是演示账套里的占位附件，只有单据信息，没有文件本体");
  }
  const blob = await getBlob(a.blobKey);
  if (!blob) throw new Error("文件本体已经不在这台机器上了（可能清过浏览器数据）");
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = a.name;
  el.click();
  // 立刻 revoke 会让 Safari 的下载中途断掉，给一帧的余量
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 能不能在浏览器里直接预览。能预览就不用先下载再找文件 */
export const previewable = (a: Attachment) => !a.placeholder && !!a.blobKey && (a.mime.startsWith("image/") || a.mime === "application/pdf");

export async function openPreview(a: Attachment) {
  if (!a.blobKey) return null;
  const blob = await getBlob(a.blobKey);
  return blob ? URL.createObjectURL(blob) : null;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  // GB 这一档不是可选的：浏览器配额动辄二十几 G，只到 MB 就会打出「22205.1 MB」
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

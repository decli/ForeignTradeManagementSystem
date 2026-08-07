/**
 * 账套的读写入口。
 *
 * 内存里一份 `Database`，写完防抖落 IndexedDB。对外只暴露三件事：
 * `load()` / `mutate()` / `subscribe()`。所有查询都是对内存对象的同步计算，
 * 见 `queries.ts`。
 */

import { hashPassword } from "@/auth/password";
import { idbAvailable, idbDel, idbGet, idbSet } from "./idb";
import { buildSeed } from "./seed";
import type { AuditLog, Database } from "./types";
import { DB_VERSION, DEMO_PASSWORD } from "./types";

const KEY = "db";
const SAVE_DEBOUNCE = 220;

let current: Database | null = null;
let persistent = true;
let saveTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function scheduleSave() {
  if (!persistent) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (current) void idbSet(KEY, current).catch(() => { persistent = false; });
  }, SAVE_DEBOUNCE);
}

/** 立刻落盘，用在「导出 / 关页面前」这种等不起防抖的地方 */
export async function flush() {
  window.clearTimeout(saveTimer);
  if (current && persistent) await idbSet(KEY, current).catch(() => undefined);
}

/**
 * 给演示账号补上口令摘要。
 *
 * 所有演示账号共用同一句口令（登录页写明了），所以这里只跑一次 PBKDF2、
 * 共用一个盐 —— 首屏省掉十来次密钥派生的等待。自己注册的账号在
 * `registerAccount` 里各拿各的随机盐，不走这条捷径。
 */
async function ensureCredentials(db: Database) {
  if (db.credentials.length) return db;
  const shared = new Uint8Array(16).fill(7);
  const hash = await hashPassword(DEMO_PASSWORD, shared);
  const at = new Date().toISOString();
  db.credentials = db.users
    .filter((u) => u.active)
    .map((u) => ({ username: u.username, userId: u.id, hash, demo: true, createdAt: at, lastLoginAt: null }));
  return db;
}

export async function load(): Promise<Database> {
  if (current) return current;
  persistent = await idbAvailable();

  if (persistent) {
    const saved = await idbGet<Database>(KEY).catch(() => undefined);
    // 结构版本对不上就重灌 —— 演示站没有迁移脚本这回事
    if (saved && saved.version === DB_VERSION) {
      current = await ensureCredentials(saved);
      return current;
    }
  }

  current = await ensureCredentials(buildSeed());
  scheduleSave();
  return current;
}

/**
 * `useSyncExternalStore` 的 getSnapshot 会在渲染中同步调用，这里绝不能抛异常
 * —— 开发时热更新会把模块重新求值、把 `current` 清空，而 React 里挂着的组件
 * 还在渲染，一抛就是整页白屏。先拿一份种子顶上，下一次 `load()` 会把
 * 持久化的那份接回来。返回的是同一个引用，不会引起无限重渲染。
 */
export function snapshot(): Database {
  if (!current) current = buildSeed();
  return current;
}

export function isPersistent() {
  return persistent;
}

/**
 * 唯一的写入口。
 * 传进来的 draft 是可以直接改的浅拷贝 —— 改完换一个新的顶层对象引用，
 * React 才知道要重渲染。
 */
export function mutate(fn: (draft: Database) => void) {
  const draft: Database = { ...snapshot() };
  fn(draft);
  current = draft;
  scheduleSave();
  emit();
  return current;
}

/** 写操作留痕。所有 mutation 都该顺手调一次，审计页面才查得到。 */
export function pushAudit(draft: Database, entry: Omit<AuditLog, "id" | "at">) {
  draft.auditLogs = [
    { ...entry, id: `aud_${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString() },
    ...draft.auditLogs,
  ].slice(0, 800);
}

export async function resetToSeed() {
  current = await ensureCredentials(buildSeed());
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

export async function clearAll() {
  await idbDel(KEY).catch(() => undefined);
  current = await ensureCredentials(buildSeed());
  emit();
  return current;
}

/** 导出的账套不带口令摘要 —— 那是这台机器上的东西，不该跟着业务数据走 */
export function exportJson() {
  const { credentials: _drop, ...rest } = snapshot();
  return JSON.stringify(rest, null, 2);
}

export async function importJson(text: string) {
  const parsed = JSON.parse(text) as Database;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.shipments)) {
    throw new Error("这个文件不像是 TRADEFLOW 账套导出的 JSON");
  }
  // 导入的是业务数据，登录凭据留在本机不动
  const keep = current?.credentials ?? [];
  current = await ensureCredentials({ ...parsed, version: DB_VERSION, credentials: keep });
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

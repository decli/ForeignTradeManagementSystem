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
import { autoSnapshot, takeSnapshot } from "./backup";
import { publish, startSync } from "./sync";
import { emptyPresales } from "./presales-types";
import { emptyFlow } from "./flow-types";
import type { AuditLog, Database } from "./types";
import { DB_VERSION, DEMO_PASSWORD } from "./types";

const KEY = "db";
const SAVE_DEBOUNCE = 220;

let current: Database | null = null;
let persistent = true;
let saveTimer: number | undefined;
/** 正在接收别处推来的快照。此时不能再广播出去，否则两个标签页会互相弹球 */
let adopting = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 落盘即广播 —— 两件事共用一个防抖。
 * 分开做没有意义：本地存不下的东西也不该让别的标签页信以为真。
 */
function scheduleSave() {
  if (!persistent) {
    if (!adopting && current) publish(current);
    return;
  }
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!current) return;
    void idbSet(KEY, current).catch(() => {
      persistent = false;
    });
    if (!adopting) publish(current);
  }, SAVE_DEBOUNCE);
}

/**
 * 接住别处（另一个标签页 / 将来的后端）推来的整份快照。
 *
 * 不走 mutate —— mutate 会广播，而广播回去就是一个无限来回。
 * 也不落盘：推给我的那一边自己已经存过了，这里再存一次只是多写一遍。
 */
function adoptRemote(db: Database) {
  // 版本对不上就不接 —— 一个标签页开着旧版本代码时，它推来的结构可能缺表
  if (!db || db.version !== DB_VERSION) return;
  adopting = true;
  current = db;
  emit();
  adopting = false;
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

/**
 * 补齐缺失的集合。
 *
 * 导入的可能是上个版本导出的账套，里面没有 `piLines` / `presales` 这些新表。
 * 少一个数组，页面上就是一句 `Cannot read properties of undefined` 白屏。
 * 宁可接一份不完整的旧账套（缺的部分是空的），也不要让用户的导出文件作废。
 */
function hydrate(db: Database): Database {
  return {
    ...db,
    contacts: db.contacts ?? [],
    piLines: db.piLines ?? [],
    attachments: db.attachments ?? [],
    savedViews: db.savedViews ?? [],
    presales: db.presales ?? emptyPresales(),
    flow: db.flow ?? emptyFlow(),
  };
}

export async function load(): Promise<Database> {
  if (current) return current;
  persistent = await idbAvailable();
  startSync(adoptRemote);

  if (persistent) {
    const saved = await idbGet<Database>(KEY).catch(() => undefined);
    // 结构版本对不上就重灌 —— 演示站没有迁移脚本这回事
    if (saved && saved.version === DB_VERSION) {
      /* 版本号对上也要过一遍 hydrate。
         看起来多余，实际上救过一次：开发中途版本号已经升到新值、
         而新表还没写进 seed，那一刻存下的账套就是「版本对、表缺」的，
         读回来直接白屏。版本号只能证明"结构世代"，证明不了"每张表都在"。 */
      current = await ensureCredentials(hydrate(saved));
      // 先备份再让用户开始改：备份的价值全在于它是"我搞砸之前"那一份
      void autoSnapshot(current);
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
    throw new Error("这个文件不像是信风账套导出的 JSON");
  }
  // 导入的是业务数据，登录凭据留在本机不动
  const keep = current?.credentials ?? [];
  current = await ensureCredentials(hydrate({ ...parsed, version: DB_VERSION, credentials: keep }));
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

/**
 * 从备份回滚。
 *
 * 回滚前先把**当前状态**再备一份 —— 用户点回滚往往是慌的，
 * 点完发现回错了那份还得能回来。这一份的成本是几百 KB，值。
 */
export async function restoreSnapshot(db: Database) {
  const keep = current?.credentials ?? [];
  if (current) await takeSnapshot(current, "manual").catch(() => undefined);
  current = await ensureCredentials(hydrate({ ...db, version: DB_VERSION, credentials: keep }));
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

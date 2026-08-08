/**
 * 协同层。
 *
 * ── 现状：能做的和做不到的 ──
 * 这个产品部署在纯静态托管上，没有服务端运行时，也就没有"多台电脑看同一份数据"。
 * 但**协同的机制**不止网络那一段，它是三件事：
 *   1. 别人改了，我这边要知道；
 *   2. 我这边要能无缝把变更接过来，而不是弹一句"数据已过期请刷新"；
 *   3. 两边同时改同一条时，要有说得清的裁决规则。
 * 这三件事在一台机器的**多个标签页**之间是完全成立的，而且实现一模一样。
 * 所以这里把它真的跑起来 —— 开两个标签页，一边改，另一边立刻变。
 * 接上后端时替换的只是"消息从哪来"，上面全部不动。
 *
 * ── 裁决规则：最后写入者胜 ──
 * 整库是一条记录，一次 mutate 换一个新的顶层对象，所以广播的就是整份快照，
 * 收到就整份换上。两个标签页同时改不同的单子，后提交的那份会盖掉前一份的改动。
 * 这在同一个人开几个标签页的场景下是对的（人不会同时在两个页面改两张单）；
 * 真到多人并发，就得换成 op 级合并 —— 接口下面留好了，见 SyncAdapter。
 *
 * ── 接后端从哪改 ──
 * 实现一个 SyncAdapter 塞给 setAdapter() 即可。BroadcastChannel 这份
 * (`localTabAdapter`) 就是照着这个接口写的，可以当参考实现。
 */

import type { Database } from "./types";

/**
 * 一次变更。
 *
 * 现在广播的是整份快照（见上面的裁决规则），但接口按 op 设计 ——
 * 真接了后端要做的是 op 级合并，那时候需要的字段就是这些。
 * 现在就定下来，免得到时候改接口牵动上层。
 */
export type SyncOp = {
  id: string;
  at: string;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  /** 变更后的字段。删除是 null */
  patch: unknown;
};

export type SyncStatus = {
  mode: "local" | "tabs" | "remote";
  label: string;
  /** 最近一次收到别处的变更 */
  lastInAt: string | null;
  /** 最近一次把变更发出去 */
  lastOutAt: string | null;
  /** 同一账套下还有几个活着的标签页（不含自己） */
  peers: number;
};

export interface SyncAdapter {
  readonly mode: SyncStatus["mode"];
  readonly label: string;
  /** 把整份快照发出去 */
  broadcast(db: Database): void;
  /** 别处推来的快照。返回取消订阅 */
  subscribe(onRemote: (db: Database) => void): () => void;
  /** 有几个对端。做不到就返回 0 */
  peers(): number;
  dispose(): void;
}

/* ═══════════════════ 本机多标签页 ═══════════════════ */

const CHANNEL = "tradewind-sync";
/** 心跳间隔。对端计数靠它，太密会吵，太疏会显示"0 个对端"其实有 */
const BEAT_MS = 4000;
const BEAT_STALE = BEAT_MS * 2.5;

type Wire =
  | { t: "db"; from: string; db: Database }
  | { t: "beat"; from: string }
  | { t: "bye"; from: string };

function localTabAdapter(): SyncAdapter | null {
  if (typeof BroadcastChannel === "undefined") return null;

  const me = Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel(CHANNEL);
  const seen = new Map<string, number>();
  let onDb: ((db: Database) => void) | null = null;

  const beat = window.setInterval(() => {
    ch.postMessage({ t: "beat", from: me } satisfies Wire);
    const cut = Date.now() - BEAT_STALE;
    for (const [k, v] of seen) if (v < cut) seen.delete(k);
  }, BEAT_MS);

  ch.onmessage = (e: MessageEvent<Wire>) => {
    const m = e.data;
    if (!m || m.from === me) return;
    if (m.t === "bye") {
      seen.delete(m.from);
      return;
    }
    seen.set(m.from, Date.now());
    if (m.t === "db") onDb?.(m.db);
  };

  // 上来先报个到，让已经开着的标签页立刻把自己算进对端数
  ch.postMessage({ t: "beat", from: me } satisfies Wire);

  const bye = () => ch.postMessage({ t: "bye", from: me } satisfies Wire);
  window.addEventListener("pagehide", bye);

  return {
    mode: "tabs",
    label: "本机多标签页",
    broadcast(db) {
      // structuredClone 会被 postMessage 自动做，这里直接发
      ch.postMessage({ t: "db", from: me, db } satisfies Wire);
    },
    subscribe(fn) {
      onDb = fn;
      return () => {
        onDb = null;
      };
    },
    peers: () => seen.size,
    dispose() {
      window.clearInterval(beat);
      window.removeEventListener("pagehide", bye);
      bye();
      ch.close();
    },
  };
}

/* ═══════════════════ 装配 ═══════════════════ */

let adapter: SyncAdapter | null = null;
let status: SyncStatus = { mode: "local", label: "仅本机", lastInAt: null, lastOutAt: null, peers: 0 };
const watchers = new Set<() => void>();

const bump = () => {
  for (const fn of watchers) fn();
};

export function watchSync(fn: () => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

export function syncStatus(): SyncStatus {
  const peers = adapter?.peers() ?? 0;
  if (peers !== status.peers) status = { ...status, peers };
  return status;
}

/** 换一个适配器。接了后端就在这里塞进来 */
export function setAdapter(next: SyncAdapter | null, onRemote: (db: Database) => void) {
  adapter?.dispose();
  adapter = next;
  status = { ...status, mode: next?.mode ?? "local", label: next?.label ?? "仅本机", peers: next?.peers() ?? 0 };
  if (next) {
    next.subscribe((db) => {
      status = { ...status, lastInAt: new Date().toISOString() };
      onRemote(db);
      bump();
    });
  }
  bump();
}

/**
 * 启动。
 * `onRemote` 由 db.ts 提供 —— 它知道怎么把一份快照原样接上去而不触发回环广播。
 */
export function startSync(onRemote: (db: Database) => void) {
  if (adapter) return;
  setAdapter(localTabAdapter(), onRemote);
}

export function publish(db: Database) {
  if (!adapter) return;
  adapter.broadcast(db);
  status = { ...status, lastOutAt: new Date().toISOString() };
  bump();
}

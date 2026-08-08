/**
 * 极小的 IndexedDB 封装 —— 只需要「读一个键 / 写一个键 / 删一个键」。
 *
 * 为什么不是 localStorage：它是同步 API，写 300KB 台账会卡住主线程；
 * 5MB 上限对导入过 Excel 的账套也不够用。
 *
 * 为什么整库存成一条记录而不是一个表一个 store：这个数据量（千行级）
 * 一次性读进内存就够跑，换来的是**同步查询** —— 表格筛选、排序、
 * 看板聚合都不用 async，UI 代码干净一大截，写入还天然是原子的。
 */

/**
 * ⚠️ 主账套库的**版本号永远停在 1**。
 *
 * 这一版新增了附件和备份两类数据，第一反应是往同一个库里加两个 store、
 * 把版本升到 2。上线后发现：老用户打开就永远卡在「正在装载账套…」——
 * 升级请求被一条挂在后台（bfcache 里的老页面）的 v1 连接挡住，
 * 而那种情况下连 `onblocked` 都不一定会触发，请求就那么静静地悬着。
 *
 * 教训是：**能不升级就不要升级**。一个已经装着用户全部身家的库，
 * 每一次版本变更都是一次可能把人锁在门外的赌博。
 * 新数据放进一个**新库**，它以 version 1 打开，跟老库的连接毫无关系，
 * 老用户的 `mt-tradeflow` 一个字节都不用动。
 */
const DB_NAME = "mt-tradeflow";
const STORE = "kv";

/**
 * 附件本体与备份快照放这个新库。
 *
 * 不放进 kv 那条整库记录里，是因为写入代价完全不同：主库每改一个字段
 * 都要整条重新序列化落盘，一份 8MB 的提单扫描件混进去，
 * 以后每次改备注都要顺带重写这 8MB。
 */
const AUX_NAME = "mt-tradeflow-aux";
const FILES = "files";
const SNAPS = "snapshots";

/** 兜底：某些隐私模式下 IndexedDB 既不成功也不报错，不能把用户卡在装载页 */
const OPEN_TIMEOUT = 6000;

const pool = new Map<string, Promise<IDBDatabase>>();

function openDb(name: string, stores: string[]): Promise<IDBDatabase> {
  const hit = pool.get(name);
  if (hit) return hit;

  const p = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error(`${name} 打开超时`))), OPEN_TIMEOUT);

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name, 1);
    } catch (e) {
      clearTimeout(timer);
      done(() => reject(e));
      return;
    }

    req.onupgradeneeded = () => {
      for (const st of stores) if (!req.result.objectStoreNames.contains(st)) req.result.createObjectStore(st);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // 万一将来真要升版本：收到通知就主动让位，别让两个标签页互相卡死
      db.onversionchange = () => {
        db.close();
        pool.delete(name);
      };
      done(() => resolve(db));
    };
    req.onerror = () => {
      clearTimeout(timer);
      done(() => reject(req.error));
    };
    req.onblocked = () => {
      clearTimeout(timer);
      done(() => reject(new Error("其他标签页挡住了数据库，关掉后刷新即可")));
    };
  });

  // 失败之后允许下次重试，不要因为一次超时就永久退化成内存模式
  p.catch(() => pool.delete(name));
  pool.set(name, p);
  return p;
}

const open = () => openDb(DB_NAME, [STORE]);
const openAux = () => openDb(AUX_NAME, [FILES, SNAPS]);

function tx<T>(opener: () => Promise<IDBDatabase>, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return opener().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T,>(key: string) => tx<T | undefined>(open, STORE, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) =>
  tx(open, STORE, "readwrite", (s) => s.put(value, key) as IDBRequest<unknown>).then(() => undefined);
export const idbDel = (key: string) =>
  tx(open, STORE, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

/* ── 附件本体 ── */
export const fileGet = (key: string) => tx<Blob | undefined>(openAux, FILES, "readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
export const filePut = (key: string, blob: Blob) =>
  tx(openAux, FILES, "readwrite", (s) => s.put(blob, key) as IDBRequest<unknown>).then(() => undefined);
export const fileDel = (key: string) =>
  tx(openAux, FILES, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

/* ── 备份快照 ── */
export const snapKeys = () => tx<IDBValidKey[]>(openAux, SNAPS, "readonly", (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>);
export const snapGet = <T,>(key: string) => tx<T | undefined>(openAux, SNAPS, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const snapPut = (key: string, value: unknown) =>
  tx(openAux, SNAPS, "readwrite", (s) => s.put(value, key) as IDBRequest<unknown>).then(() => undefined);
export const snapDel = (key: string) =>
  tx(openAux, SNAPS, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

/** 还剩多少空间。备份和附件都吃配额，用户得看得见 */
export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

/** 隐私模式 / 关掉存储的浏览器里 IndexedDB 会直接抛错，得能退到纯内存跑 */
export async function idbAvailable() {
  try {
    if (typeof indexedDB === "undefined") return false;
    await open();
    return true;
  } catch {
    return false;
  }
}

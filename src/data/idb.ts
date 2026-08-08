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

const DB_NAME = "mt-tradeflow";
const STORE = "kv";
/**
 * 附件本体单独一个 store。
 *
 * 不放进 kv 那条整库记录里，是因为写入代价完全不同：主库每改一个字段都要
 * 整条重新序列化落盘，一份 8MB 的提单扫描件混进去，以后每次改备注都要
 * 顺带重写这 8MB。分开之后，附件只在上传和删除时动一次。
 */
const FILES = "files";
/** 备份快照。同理，跟主库分开，回滚才不会自己覆盖自己 */
const SNAPS = "snapshots";

const IDB_VERSION = 2;

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      // 老库升上来时 kv 已经在了，只补新的 —— 升级不能碰用户已有的账套
      for (const name of [STORE, FILES, SNAPS]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T,>(key: string) => tx<T | undefined>(STORE, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) =>
  tx(STORE, "readwrite", (s) => s.put(value, key) as IDBRequest<unknown>).then(() => undefined);
export const idbDel = (key: string) =>
  tx(STORE, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

/* ── 附件本体 ── */
export const fileGet = (key: string) => tx<Blob | undefined>(FILES, "readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
export const filePut = (key: string, blob: Blob) =>
  tx(FILES, "readwrite", (s) => s.put(blob, key) as IDBRequest<unknown>).then(() => undefined);
export const fileDel = (key: string) =>
  tx(FILES, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

/* ── 备份快照 ── */
export const snapKeys = () => tx<IDBValidKey[]>(SNAPS, "readonly", (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>);
export const snapGet = <T,>(key: string) => tx<T | undefined>(SNAPS, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const snapPut = (key: string, value: unknown) =>
  tx(SNAPS, "readwrite", (s) => s.put(value, key) as IDBRequest<unknown>).then(() => undefined);
export const snapDel = (key: string) =>
  tx(SNAPS, "readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

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

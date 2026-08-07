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

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T,>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) =>
  tx("readwrite", (s) => s.put(value, key) as IDBRequest<unknown>).then(() => undefined);
export const idbDel = (key: string) =>
  tx("readwrite", (s) => s.delete(key) as IDBRequest<unknown>).then(() => undefined);

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

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
 * ⚠️ 打开数据库时**不要写版本号**。这条规则是两次线上事故换来的。
 *
 * ── 第一次：写大了 ──
 * 新增附件和备份，往同一个库里加两个 store、把版本从 1 升到 2。
 * 老用户打开永远卡在「正在装载账套…」—— 升级请求被一条挂在后台
 * （bfcache 里的老页面）的 v1 连接挡住，那种情况下连 `onblocked`
 * 都不一定触发，请求就那么静静地悬着。
 *
 * ── 第二次：写小了 ──
 * 上一条的修法是"回到 v1、新数据放进新库"。可那时已经有一批浏览器
 * 被上一版升到了 v2，而 `indexedDB.open(name, 1)` 在 v2 的库上会直接
 * 抛 `VersionError: The requested version (1) is less than the existing version (2)`。
 * 于是这批人退化成**纯内存模式**：页面能开、能改，改完刷新全没了，
 * 而且一句提示都没有。比卡在装载页更坏 —— 至少那个看得见。
 *
 * ── 结论 ──
 * 版本号写死多少都是错的：写小了炸在升过级的机器上，写大了要赌一次升级。
 * `indexedDB.open(name)` 不带版本号 = **打开这台机器上现有的那一版**
 * （不存在才新建 v1），既不会降级也不会触发升级。
 * 只有在真的缺 store 时，才以 `现有版本 + 1` 重开一次去补建。
 *
 * 附带的好处：被上一版升到 v2 的那批浏览器，数据这下能读回来了。
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

/**
 * 一次 open 请求。`version` 省略 = 打开现有版本（库不存在时新建 v1）。
 * 三层保护都在这里：超时、被挡、以及被别的标签页要求让位。
 */
function rawOpen(name: string, stores: string[], version?: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error(`${name} 打开超时`))), OPEN_TIMEOUT);

    let req: IDBOpenDBRequest;
    try {
      req = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    } catch (e) {
      clearTimeout(timer);
      done(() => reject(e));
      return;
    }

    // 新建库、或补建缺失的 store 时才会走到这里
    req.onupgradeneeded = () => {
      for (const st of stores) if (!req.result.objectStoreNames.contains(st)) req.result.createObjectStore(st);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // 别的标签页要升级时主动让位，否则两边互相卡死
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
}

function openDb(name: string, stores: string[]): Promise<IDBDatabase> {
  const hit = pool.get(name);
  if (hit) return hit;

  const p = (async () => {
    // 先按"这台机器上现有的版本"打开。不指定版本 = 既不降级也不升级
    const db = await rawOpen(name, stores);
    if (stores.every((st) => db.objectStoreNames.contains(st))) return db;

    /* 确实缺 store 才升一版去补建 —— 这是唯一还需要赌一次升级的路径，
       所以先把手上这条连接关掉，至少不会是自己挡住自己。 */
    const next = db.version + 1;
    db.close();
    pool.delete(name);
    return rawOpen(name, stores, next);
  })();

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

/**
 * 申请「持久化存储」。
 *
 * ── 不申请的后果 ──
 * 默认的站点存储是 **best-effort** 的：浏览器磁盘紧张时可以随时清掉。
 * Safari 的 ITP 更进一步 —— 脚本写入的存储 7 天不访问就清。
 * 用户休个年假回来，账套没了，而且没有任何前兆。
 *
 * ── 为什么不在首屏申请 ──
 * 浏览器按「参与度」决定给不给。刚打开就问基本被拒，
 * 而且拒过之后再问也不会变。等用户真的产生了数据再问，通过率高得多。
 *
 * ── 只报告，不承诺 ──
 * 各家实现差别很大，这里如实返回结果，由 UI 显示**真实状态**。
 * 绝不能显示成"已经帮你保护好了"—— 那会让人省掉真正该做的导出备份。
 */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** true = 已授予；false = 支持但没给；null = 这个浏览器压根没这个 API */
export async function isPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

/** 还剩多少空间。备份和附件都吃配额，用户得看得见 */
export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

/**
 * 打不开主库时，究竟是哪一种打不开。
 *
 * 三种情况对用户的意义完全不同，不能都算作"没有存储"：
 *  - `none`      能用，一切正常
 *  - `unsupported` 浏览器压根没有 IndexedDB（隐私模式等）—— 无解，只能靠导出
 *  - `wedged`    IndexedDB 能用，**偏偏这一个库打不开**：请求发出去之后
 *                success / error / blocked 一个都不触发，就那么悬着。
 *                成因是某次没走完的版本升级把库锁死了，而且这个状态**跨刷新存在**。
 *                这正是本项目上一次 v1→v2 事故留下的残骸。
 *                这一种有救：把这个库删掉重建。
 */
export type StorageFault = "none" | "unsupported" | "wedged";

let fault: StorageFault = "none";
export const storageFault = () => fault;

export async function idbAvailable() {
  if (typeof indexedDB === "undefined") {
    fault = "unsupported";
    return false;
  }
  try {
    await open();
    fault = "none";
    return true;
  } catch {
    /* 主库开不了。再拿一个全新的库名探一下：
       新库能开 = IndexedDB 本身没问题，是这个库被锁死了（可修）；
       新库也开不了 = 整个 IndexedDB 不可用（无解）。
       这一步值得做：两种情况该对用户说的话完全不同。 */
    const probe = `${DB_NAME}-probe`;
    try {
      const db = await openDb(probe, ["p"]);
      // 探针用完就地清理：连接关掉、库删掉，别在用户机器上留垃圾
      db.close();
      pool.delete(probe);
      indexedDB.deleteDatabase(probe);
      fault = "wedged";
    } catch {
      pool.delete(probe);
      fault = "unsupported";
    }
    return false;
  }
}

/**
 * 把锁死的主库删掉重建。
 *
 * ── 为什么不能当场删，必须重载一次 ──
 * 实测过：直接调 `deleteDatabase` 一定被 blocked，而挡住它的**正是本页自己**。
 * `idbAvailable()` 那次 open 虽然 6 秒后超时、promise 已经 reject 了，
 * 但底层的 `IDBOpenDBRequest` 还挂在连接队列里 —— 而 IndexedDB 没有
 * 取消请求的 API。只要这一帧还活着，删除就永远排在它后面。
 *
 * 所以拆成两步：这里只记一个标记然后重载；真正的删除在下一次启动、
 * **任何人碰 IndexedDB 之前**执行（见 `consumeRecovery`）。
 */
const RECOVER_FLAG = "mt.recover";

export function requestRecovery() {
  try {
    sessionStorage.setItem(RECOVER_FLAG, "1");
  } catch {
    /* 存不下就算了，下面照样重载，只是这次修不成 */
  }
  window.location.reload();
}

/**
 * 启动最早期调用，必须在任何 open 之前。
 * 有标记就把主库删掉 —— 此时本页还没发出过任何 open 请求，删得掉。
 */
export function consumeRecovery(): Promise<void> {
  let flagged = false;
  try {
    flagged = sessionStorage.getItem(RECOVER_FLAG) === "1";
    sessionStorage.removeItem(RECOVER_FLAG);
  } catch {
    /* 读不到就当没有 */
  }
  if (!flagged) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      pool.delete(DB_NAME);
      const req = indexedDB.deleteDatabase(DB_NAME);
      // 删除也可能挂住（比如别的标签页开着），给上限，别把启动卡死
      const timer = setTimeout(resolve, OPEN_TIMEOUT);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      req.onsuccess = done;
      req.onerror = done;
      req.onblocked = done;
    } catch {
      resolve();
    }
  });
}

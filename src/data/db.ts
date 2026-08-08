/**
 * 账套的读写入口。
 *
 * 内存里一份 `Database`，写完防抖落 IndexedDB。对外只暴露三件事：
 * `load()` / `mutate()` / `subscribe()`。所有查询都是对内存对象的同步计算，
 * 见 `queries.ts`。
 */

import { hashPassword } from "@/auth/password";
import { idbAvailable, idbDel, idbGet, idbSet, requestPersist } from "./idb";
import { buildSeed } from "./seed";
import { buildEmpty } from "./empty";
import { activeProfile, dbKeyFor, setActiveProfile, type ProfileId } from "./profile";
import { autoSnapshot, takeSnapshot } from "./backup";
import { publish, startSync } from "./sync";
import { emptyPresales } from "./presales-types";
import { emptyFlow } from "./flow-types";
import type { AuditLog, Database } from "./types";
import { DB_VERSION, DEFAULT_MORE_OR_LESS_BP, DEMO_PASSWORD } from "./types";

/** 当前账套的存储键。演示 = "db"（老键，不搬家），真实 = "db:live" */
const KEY = dbKeyFor(activeProfile());
const SAVE_DEBOUNCE = 220;

let current: Database | null = null;
let persistent = true;
let saveTimer: number | undefined;
/** 正在接收别处推来的快照。此时不能再广播出去，否则两个标签页会互相弹球 */
let adopting = false;
/** 持久化只申请一次。见 mutate() 里的说明 */
let persistAsked = false;
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
  // 账套比代码新时一个字都不许写 —— 写下去就是把新版本的字段抹掉
  if (readOnly) return;
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
  if (readOnly) return;
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
    shipmentLines: db.shipmentLines ?? [],
    paymentTerms: db.paymentTerms ?? [],
    attachments: db.attachments ?? [],
    savedViews: db.savedViews ?? [],
    presales: db.presales ?? emptyPresales(),
    flow: db.flow ?? emptyFlow(),
  };
}

/**
 * 迁移阶梯。
 *
 * ── 为什么「版本对不上就重灌」必须废掉 ──
 * 那条规则在演示站上是对的：没有真实数据，重灌一份干净种子最省事。
 * 可一旦有人把真单据录进来，它就变成了**静默的数据销毁** ——
 * 用户升一次版本，一年的台账被 63 张演示 PI 盖掉，全程没有一句提示。
 * 这和上一次 IndexedDB v1→v2 是同一类错误：版本号变更不该是一场赌博。
 *
 * 新规则只有一条：**存过的账套永远保留**。
 * 缺整张表由 `hydrate` 补，缺字段由这里补，两者都不会丢已有数据。
 *
 * ── 加一条迁移怎么写 ──
 * 往数组末尾追加一项，`to` 填新的 `DB_VERSION`，`up` 里只做
 * 「把老数据补成新结构」这一件事。**必须能重复执行而不出错** ——
 * 多标签页、导入旧备份、回滚再前滚，都可能让同一条迁移跑第二遍。
 * 所以一律写成 `if (x == null) x = 默认值`，不要写成 `x = x + 1`。
 */
/** `up` 返回「我确实改了东西」—— 决定这次载入要不要回写，见 migrate() */
type Migration = { to: number; note: string; up: (db: Database) => boolean };

const MIGRATIONS: Migration[] = [
  {
    to: 14,
    note: "记录上次导出时间",
    // 老账套没导出过，但也不能当成"刚导出过"。null = 从未导出，UI 会照此提醒
    up: (db) => {
      if (db.lastExportAt !== undefined) return false;
      db.lastExportAt = null;
      return true;
    },
  },
  {
    to: 15,
    note: "分批出运明细与溢短装",
    up: (db) => {
      let changed = false;
      if (!Array.isArray(db.shipmentLines)) {
        db.shipmentLines = [];
        changed = true;
      }
      /* 老 PI 一律给默认的 ±5%。
         不去猜每张单的真实约定 —— 猜错会让"这单出完了没有"直接判错，
         而这个数用户在 PI 上随时能改。 */
      for (const p of db.pis) {
        if (p.moreOrLessBp == null) {
          p.moreOrLessBp = DEFAULT_MORE_OR_LESS_BP;
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    to: 16,
    note: "结构化收款计划",
    up: (db) => {
      if (Array.isArray(db.paymentTerms)) return false;
      /* 不替老单子瞎猜分期。付款方式原来是自由文本，解析它等于用正则
         猜钱什么时候该到 —— 猜错比没有更坏。空着，界面上提示去补。 */
      db.paymentTerms = [];
      return true;
    },
  },
];

export type SchemaState =
  | { kind: "ok" }
  /** 老账套已升级到当前结构，列出跑过哪几步 */
  | { kind: "migrated"; from: number; steps: string[] }
  /** 账套结构比这份代码还新（用户加载到了缓存的旧 bundle），只读 */
  | { kind: "ahead"; saved: number; app: number };

let schema: SchemaState = { kind: "ok" };
let readOnly = false;
/** 这次载入是否真的改动了账套（版本号跨了，或补上了缺的字段）。决定要不要回写 */
let migrated = false;
/** 正在进行的载入。并发调用共用它，见 load() */
let loading: Promise<Database> | null = null;

export const schemaState = () => schema;
/** 只读态下所有写入都被丢弃，UI 该拦在前面并给出说明 */
export const isReadOnly = () => readOnly;

function migrate(saved: Database): Database {
  const from = saved.version ?? 0;
  const db = hydrate(saved);

  /* 账套比代码新：绝不回写。
     用户多半是拿到了 CDN 缓存的旧 bundle，刷新一下就好了；
     而我们要是按旧结构存一遍，就把新版本写进去的字段永久抹掉了。 */
  if (from > DB_VERSION) {
    readOnly = true;
    schema = { kind: "ahead", saved: from, app: DB_VERSION };
    return db;
  }

  /* 每一条都无条件跑一遍，不按版本号跳过。
     迁移按约定都是幂等的（`if (x == null) x = 默认值`），重复执行没有副作用；
     而"只信版本号"有一个修不回来的坑：只要版本号被盖上、对应的迁移却没跑过
     （发布顺序出错、热替换拿到半新半旧的模块、有人手改过记录），
     那条迁移就**永远**不会再执行 —— 字段永久性地缺着，而且毫无迹象。
     这是实测踩到的：记录标着 v15，moreOrLessBp 却是 null。
     几千行数据多跑两个 if 的代价，换"不可能漏"，很划算。

     `steps` 里只列真正跨版本的那几条 —— 那是要讲给用户听的，
     而例行的幂等重跑不是。 */
  const steps: string[] = [];
  migrated = from !== DB_VERSION;
  for (const m of MIGRATIONS) {
    // 真补了字段就要回写 —— 版本号早已盖上、字段却是空的，正是上面说的那个坑
    if (m.up(db)) migrated = true;
    if (from < m.to) steps.push(`v${m.to} · ${m.note}`);
  }
  db.version = DB_VERSION;
  schema = steps.length ? { kind: "migrated", from, steps } : { kind: "ok" };
  return db;
}

/** 长得不像账套的记录。宁可当它不存在，也不能拿它去渲染出一片白屏 */
const looksLikeDb = (v: unknown): v is Database =>
  !!v && typeof v === "object" && Array.isArray((v as Database).pis) && Array.isArray((v as Database).shipments);

/**
 * 载入账套。并发调用共用同一次载入。
 *
 * `if (current) return current` 挡不住并发：`current` 要等 await 链走完才赋值，
 * 在那之前进来的第二个调用者看到的还是 null，于是**整个载入跑第二遍** ——
 * 包括深拷贝整份账套、再存一份迁移备份。
 * 实测现象：一次刷新留下两份 `migrate from v13` 快照，白白占掉两个备份槽位。
 * React StrictMode 在开发环境下必然触发；生产环境只要有两处同时调 load() 也会。
 */
export function load(): Promise<Database> {
  if (current) return Promise.resolve(current);
  loading ??= doLoad().finally(() => {
    loading = null;
  });
  return loading;
}

async function doLoad(): Promise<Database> {
  if (current) return current;
  persistent = await idbAvailable();
  startSync(adoptRemote);

  if (persistent) {
    const saved = await idbGet<Database>(KEY).catch(() => undefined);

    if (looksLikeDb(saved)) {
      const from = saved.version ?? 0;
      /* 迁移前先原样留一份。深拷贝是必要的：迁移是就地改行的，
         等异步的 takeSnapshot 真正序列化时，数据早被改过了。
         只有真的会跑步骤时才拷 —— 纯粹盖个版本号不值得存一份几百 KB 的备份。 */
      const willMigrate = MIGRATIONS.some((m) => from < m.to);
      const before = willMigrate ? (JSON.parse(JSON.stringify(saved)) as Database) : null;

      current = await ensureCredentials(migrate(saved));
      if (before) void takeSnapshot(before, "migrate", from).catch(() => undefined);
      // 先备份再让用户开始改：备份的价值全在于它是"我搞砸之前"那一份
      void autoSnapshot(current);
      /* 迁移动过就回写。
         只看 `from !== DB_VERSION` 是不够的：版本号已经是新的、字段却没补上
         （见 migrate 里的说明）时，那次自愈补的东西会留在内存里、下次打开又没了。 */
      if (migrated) scheduleSave();
      return current;
    }

    /* 有记录但读不懂 —— 可能是半截写入或别的站点撞了库名。
       不能直接拿种子盖掉：那还是"静默销毁"。挪到一边留证，再走新账套。 */
    if (saved !== undefined) {
      await idbSet(`${KEY}:salvage:${new Date().toISOString().replace(/[:.]/g, "-")}`, saved).catch(() => undefined);
    }
  }

  /* 真实账套的空壳绝不能用 buildSeed 兜底 —— 那会把 63 张演示 PI
     灌进用户以为是自己的账套里。正常情况下 switchProfile 已经写好了初始记录，
     走到这里说明那一步没成功，宁可给一个空的（并且没人能登录，问题看得见）。 */
  current = await ensureCredentials(activeProfile() === "live" ? buildEmpty() : buildSeed());
  scheduleSave();
  return current;
}

/**
 * 切换账套。
 *
 * 第一次切到真实账套时，在这里就把初始记录写好 —— 因为只有这一刻同时
 * 拿得到"当前登录的是谁"和"演示账套里的汇率配置"。等到 load() 再去建，
 * 那边既不知道 session 也读不到另一个键。
 */
export async function switchProfile(next: ProfileId, currentUserId?: string | null) {
  await flush();

  if (next === "live") {
    const existing = await idbGet<Database>(dbKeyFor("live")).catch(() => undefined);
    if (!looksLikeDb(existing)) {
      const src = snapshot();
      const user = src.users.find((u) => u.id === currentUserId) ?? null;
      const credential = user ? (src.credentials.find((c) => c.userId === user.id) ?? null) : null;
      await idbSet(dbKeyFor("live"), buildEmpty({ user, credential, fxRates: src.fxRates })).catch(() => undefined);
    }
  }

  setActiveProfile(next);
  // 见 profile.ts：内存态、订阅、广播、页面缓存全都要换，重载比手工拆干净
  window.location.reload();
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
  /* 只读态下连界面都不要动。
     让按钮"看起来生效了"、实际存不下去，正是我们一直在消灭的静默丢失 ——
     横幅已经说清楚为什么不能改，这里就不要再演一遍改成功了。 */
  if (readOnly) return snapshot();
  /* 用户真的动手改数据了 —— 这一刻申请持久化最有说服力。
     浏览器按参与度决定给不给，首屏就问基本被拒，而且拒过就没有第二次机会。
     一个会话只问一次，失败也不重试：反复弹是骚扰，不是坚持。 */
  if (!persistAsked) {
    persistAsked = true;
    void requestPersist();
  }
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

/**
 * 重灌。
 *
 * 在真实账套里"重灌"绝不能灌成演示数据 —— 那是把用户的账套换成别人的样例。
 * 真实账套的原点是**空**，而且要保住当前这个人，否则重灌完自己都登不进去。
 */
function freshForProfile() {
  if (activeProfile() !== "live") return buildSeed();
  const src = current;
  const user = src?.users[0] ?? null;
  const credential = user ? (src?.credentials.find((c) => c.userId === user.id) ?? null) : null;
  return buildEmpty({ user, credential, fxRates: src?.fxRates ?? [] });
}

export async function resetToSeed() {
  current = await ensureCredentials(freshForProfile());
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

export async function clearAll() {
  await idbDel(KEY).catch(() => undefined);
  current = await ensureCredentials(freshForProfile());
  emit();
  return current;
}

/** 导出的账套不带口令摘要 —— 那是这台机器上的东西，不该跟着业务数据走 */
export function exportJson() {
  const { credentials: _drop, ...rest } = snapshot();
  return JSON.stringify(rest, null, 2);
}

/**
 * 记下"导出成功了"。
 *
 * 由调用方在**下载真的发生之后**调用，不在 exportJson 里顺手写 ——
 * 生成字符串和用户拿到文件是两回事，中间还可能失败。
 * 记错了比不记更坏：它会让"多久没备份了"这个提醒失灵。
 */
export function markExported() {
  mutate((d) => {
    d.lastExportAt = new Date().toISOString();
  });
}

export async function importJson(text: string) {
  const parsed = JSON.parse(text) as Database;
  if (!looksLikeDb(parsed)) {
    throw new Error("这个文件不像是信风账套导出的 JSON");
  }
  // 导入的是业务数据，登录凭据留在本机不动
  const keep = current?.credentials ?? [];
  /* 走迁移阶梯，不要直接盖版本号。
     导进来的很可能是半年前导出的老账套 —— 硬贴一个当前版本号，
     等于宣称"字段都齐了"，而实际上该补的默认值一个都没补。 */
  current = await ensureCredentials(migrate({ ...parsed, credentials: keep }));
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
  // 同 importJson：备份可能是升级之前那一份，得重新爬一遍阶梯
  current = await ensureCredentials(migrate({ ...db, credentials: keep }));
  await idbSet(KEY, current).catch(() => undefined);
  emit();
  return current;
}

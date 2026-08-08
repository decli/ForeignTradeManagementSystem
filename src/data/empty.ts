/**
 * 空账套 —— 真实账套的起点。
 *
 * ── 唯一一件不能是空的事：人 ──
 * 登录态是 `db.users.find(u => u.id === session.userId)`。
 * 如果真实账套里一个用户都没有，切过去的一瞬间当前登录的人就"不存在"了，
 * 直接被踢回登录页，而且登录页上一个可选账号都没有 —— 自己把自己锁在门外。
 *
 * 所以要把**当前这个人**带过去：用户记录、登录凭据一起搬，
 * 并且提到 admin 角色。理由不是"方便"，是**新账套里只有他一个人**，
 * 没人能替他审批、也没人能替他配主体，权限卡在中间就是死锁。
 *
 * ── 什么带、什么不带 ──
 * 带：人、凭据、汇率（是配置，不是业务数据）。
 * 不带：客户、产品、供应商、PI、出运、单据、审批规则、通知 ——
 * 那些是演示内容。看着像"有用的默认值"的东西也不带，
 * 比如演示用的卖方主体：抬头银行账号全是编的，留着只会被误开进真单据。
 */

import { emptyFlow } from "./flow-types";
import { emptyPresales } from "./presales-types";
import type { Credential, Database, FxRate, User } from "./types";
import { DB_VERSION } from "./types";

const emptyOps = (): Database["ops"] => ({
  suppliers: [],
  products: [],
  rfqs: [],
  rfqQuotes: [],
  contracts: [],
  productions: [],
  payments: [],
  accounts: [],
  stock: [],
  lanes: [],
  freightQuotes: [],
  docs: [],
  logins: [],
});

export function buildEmpty(opts: { user?: User | null; credential?: Credential | null; fxRates?: FxRate[] } = {}): Database {
  const now = new Date().toISOString();
  const owner: User | null = opts.user
    ? { ...opts.user, role: "admin", team: null, scope: "all", active: true }
    : null;

  return {
    version: DB_VERSION,
    seededAt: now,
    lastExportAt: null,
    users: owner ? [owner] : [],
    credentials: opts.credential ? [{ ...opts.credential, demo: false }] : [],
    customers: [],
    contacts: [],
    sellerEntities: [],
    pis: [],
    piLines: [],
    costings: [],
    shipments: [],
    shipmentLines: [],
    milestones: [],
    notes: [],
    taxInvoices: [],
    // 汇率是配置不是业务数据。带过去，省得第一张 PI 就没法折算
    fxRates: opts.fxRates ?? [],
    auditLogs: [],
    savedViews: [],
    attachments: [],
    ops: emptyOps(),
    presales: emptyPresales(),
    flow: emptyFlow(),
  };
}

/* ── 空账套引导 ──────────────────────────────────────────────
   四步不是随便排的，是**依赖顺序**：没有卖方主体开不出任何单据，
   没有产品报不了价也算不了退税。所以清单本身就是在解释系统怎么运转。 */

export type SetupStep = {
  key: string;
  title: string;
  /** 为什么非做不可。空泛的"完善资料"没人会去点 */
  why: string;
  href: string;
  done: (db: Database) => boolean;
};

export const SETUP_STEPS: SetupStep[] = [
  {
    key: "seller",
    title: "建卖方主体",
    why: "抬头、银行账户、签章。PI、发票、装箱单全都从这里取，不建就一张单据也开不出来。",
    href: "/seller-entities",
    done: (db) => db.sellerEntities.length > 0,
  },
  {
    key: "customer",
    title: "录入客户",
    why: "可以从 Excel 直接粘贴导入。客户的账期和信用等级会决定应收账龄怎么算。",
    href: "/customers",
    done: (db) => db.customers.length > 0,
  },
  {
    key: "product",
    title: "录入产品",
    why: "HS 编码和退税率挂在产品上，报价核算器和退税计算直接取这两个数。",
    href: "/products",
    done: (db) => db.ops.products.length > 0,
  },
  {
    key: "pi",
    title: "开第一张 PI",
    why: "取号即建档。后面的采购、出运、收款、退税全靠这个号串起来。",
    href: "/pi",
    done: (db) => db.pis.length > 0,
  },
];

export const setupProgress = (db: Database) => SETUP_STEPS.filter((s) => s.done(db)).length;
export const setupDone = (db: Database) => setupProgress(db) === SETUP_STEPS.length;

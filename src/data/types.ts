/**
 * 数据模型 —— 由原 Prisma schema 平移而来，字段名与语义保持一致，
 * 这样将来要接回真正的后端，只需把 `src/data/db.ts` 换成 fetch，其余不动。
 *
 * 两条硬约定原样保留：
 *  1. 金额一律用整数「分」存。原来是 BigInt，浏览器里改成 number —— 安全整数上限
 *     9,007,199,254,740,991 分 ≈ 90 万亿元，外贸台账用不到，但仍然是整数运算，
 *     不会出现 0.1 + 0.2 的对不平账。汇率同样用 E6 整数（6.7392 → 6739200）。
 *  2. 状态用字符串 + 应用层枚举，不用数字枚举 —— 导出的 JSON 人眼可读，
 *     也方便直接喂给将来的 MySQL。
 */

export type Role = "admin" | "sales" | "merchandiser" | "purchaser" | "finance" | "viewer";
export type Scope = "self" | "team" | "all";

export type User = {
  id: string;
  username: string;
  name: string;
  /** 英文名。中文名在英文界面里读不出来，业务员一栏尤其明显 */
  nameEn?: string;
  role: Role;
  team: string | null;
  scope: Scope;
  active: boolean;
  /** 头像用的强调色索引，纯展示 */
  hue: number;
  createdAt: string;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  country: string;
  contact: string | null;
  /** A | B | C */
  creditLevel: string;
  sinosureLimitCents: number;
  sinosureUsedCents: number;
  currency: string;
  /** IANA 时区，用于「客户当地时间」 */
  timezone: string | null;
  note: string | null;
  active: boolean;
  salesId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SellerEntity = {
  id: string;
  name: string;
  taxNo: string | null;
  bank: string | null;
  active: boolean;
};

export type PiStatus = "open" | "closed" | "archived";

export type Pi = {
  id: string;
  piNo: string;
  signedOn: string | null;
  currency: string;
  amountCents: number;
  product: string | null;
  destination: string | null;
  status: PiStatus;
  customerId: string;
  salesId: string | null;
  sellerEntityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderCosting = {
  id: string;
  piId: string;
  purchaseCostCents: number;
  freightCents: number;
  customsCents: number;
  bankCents: number;
  otherCents: number;
  receivableCents: number;
  payableCents: number;
  /** 利润率，基点。2104 = 21.04%，可为负 */
  profitRateBp: number;
  /** draft | pending_review | confirmed */
  reviewState: string;
  /** 未完结 | 已完结 */
  settleState: string;
  costEstimated: boolean;
  updatedAt: string;
};

export type ReleaseState = "已放行" | "未放行" | "待报关";
export type ShipMode = "海运" | "空运" | "陆运" | "快递";

export type Shipment = {
  id: string;
  batchNo: string;
  /** 「第 4 批」这类分批标签 */
  batchLabel: string | null;
  country: string;
  /** FOB-SH / DDU / CIF … */
  term: string;
  mode: ShipMode;
  /** true = 整柜(FCL)；false = 拼柜(LCL)，里程碑多一个「进仓」 */
  fcl: boolean;
  containerNo: string | null;
  carrier: string | null;
  pod: string | null;
  releaseState: ReleaseState;
  team: string | null;
  /** 冗余一份最新动态，列表页免去一次关联查询 */
  latestNote: string | null;
  latestNoteOn: string | null;
  hasTodo: boolean;
  archived: boolean;
  piId: string | null;
  salesId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MilestoneKind = "交期" | "装柜" | "进仓" | "ATD" | "ETA";

export type ShipmentMilestone = {
  id: string;
  shipmentId: string;
  kind: MilestoneKind;
  seq: number;
  plannedOn: string | null;
  actualOn: string | null;
};

export type ShipmentNote = {
  id: string;
  shipmentId: string;
  body: string;
  happenedOn: string;
  authorId: string | null;
  createdAt: string;
};

export type TaxInvoice = {
  id: string;
  /** YYYY-MM */
  declareMonth: string;
  batch: string;
  buyer: string;
  sellerName: string;
  invoiceNo: string;
  item: string;
  qty: number;
  grossCents: number;
  netCents: number;
  taxCents: number;
  exportedOn: string | null;
  customsNo: string | null;
  customsUsdCents: number;
  piId: string | null;
  sellerEntityId: string | null;
  createdAt: string;
};

export type FxRate = {
  id: string;
  base: string;
  quote: string;
  /** market | custom */
  kind: string;
  rateE6: number;
  asOf: string;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  actorName: string;
  entity: string;
  entityId: string;
  /** 人看的单据号，审计页面直接显示 */
  entityLabel: string;
  action: string;
  before: string | null;
  after: string | null;
  at: string;
};

/**
 * 账密登录的凭据。跟 User 分开存，是因为它跟「业务数据」不是一回事：
 * 口令摘要属于这台机器上的这个人，导出账套时可以整段剔掉。
 */
export type Credential = {
  username: string;
  userId: string;
  /** pbkdf2$轮数$盐$摘要，见 src/auth/password.ts */
  hash: string;
  /** 演示账号会在登录页明示口令，自建账号不会 */
  demo: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

/** 用户自己存下来的筛选组合，跟单表 / 订单 / 退税共用 */
export type SavedView = {
  id: string;
  module: string;
  name: string;
  query: string;
  createdAt: string;
};

export type Database = {
  /** 数据结构版本，跟 seed 一起升，版本不一致就重新灌种子 */
  version: number;
  seededAt: string;
  users: User[];
  customers: Customer[];
  sellerEntities: SellerEntity[];
  pis: Pi[];
  costings: OrderCosting[];
  shipments: Shipment[];
  milestones: ShipmentMilestone[];
  notes: ShipmentNote[];
  taxInvoices: TaxInvoice[];
  fxRates: FxRate[];
  auditLogs: AuditLog[];
  savedViews: SavedView[];
  credentials: Credential[];
};

export const DB_VERSION = 6;

/** 演示口令：登录页会直接写出来，没什么好藏的 */
export const DEMO_PASSWORD = "demo1234";

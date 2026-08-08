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
  /**
   * 账期天数，从提单日起算。0 = 款到发货。
   *
   * 应收账龄全靠它 —— 没有账期就只有"欠了多少天"，没有"逾期多少天"，
   * 而老板要的是后者：一个 A 级客户放账 60 天欠 45 天是正常的，
   * 一个款到发货的客户欠 3 天就已经出事了。
   */
  termDays: number;
  /** IANA 时区，用于「客户当地时间」 */
  timezone: string | null;
  note: string | null;
  active: boolean;
  salesId: string | null;
  /** 自定义字段的值。用户加字段不该触发一次数据迁移，见 flow-types.ts */
  ext?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

/**
 * 开票主体 / PI 卖方。
 *
 * 后面这一批字段是**单据要用的**：一张发给国外客户的商业发票，
 * 没有英文抬头、地址和 SWIFT 就是废纸 —— 客户的银行打不了款，
 * 清关行也认不了。所以它们不是"可选的补充信息"，是单据的必填项。
 */
export type SellerEntity = {
  id: string;
  name: string;
  /** 英文抬头。单据上打的是这个，不是中文名 */
  nameEn?: string;
  taxNo: string | null;
  bank: string | null;
  /** 银行英文名 */
  bankEn?: string;
  /** 账号 */
  bankAcct?: string;
  /** SWIFT 代码。客户汇款必须有 */
  swift?: string;
  addr?: string;
  addrEn?: string;
  tel?: string;
  email?: string;
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
  /** 从哪张报价单转过来的。一单到底的链路视图靠它往回追 */
  quoteId?: string | null;
  /**
   * 溢短装，基点。500 = ±5%。
   *
   * 外贸合同上的 "5% more or less at seller's option" —— 生产和装柜
   * 不可能刚好凑到整数，合同允许多装少装一点，超出这个范围客户才有权拒收。
   * 分批出运对账时判断"这张 PI 出完了没有"用的就是它，
   * 而不是死磕 `已出 === 订单量`：那样每一张单最后都会挂着几十件的尾巴。
   */
  moreOrLessBp?: number;
  ext?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

/**
 * PI 的商品明细行。
 *
 * ── 为什么非有不可 ──
 * 原先 PI 上只有一个 `product: string`，写着「防护服 8 万件（分 5 批）」。
 * 那是**一句话，不是数据**：装箱单没法按它算箱数，商业发票没法按它开行，
 * 退税没法按它对 HS 编码，配柜没法按它排体积。半个系统卡在这个字段上。
 *
 * ── 三个字段是成交那一刻的快照，故意不跟主档走 ──
 * 品名、HS 编码、退税率都在这里冗余了一份。产品主档改名、国家调退税率，
 * 都不该追溯改写一年前已经报关完的单据 —— 那张单据当时就是那么开的。
 */
export type PiLine = {
  id: string;
  piId: string;
  /** 行号，从 1 起。单据上要打出来 */
  seq: number;
  /** 关联产品主档。手写行可以为空 */
  productId: string | null;
  name: string;
  nameEn: string | null;
  hsCode: string | null;
  /** 出口退税率，基点。1300 = 13% */
  refundRateBp: number;
  qty: number;
  unit: string;
  /**
   * 成交单价 × 10000（4 位小数），PI 币种。
   *
   * ── 为什么不是「分」──
   * 口罩的成交价是 $0.0850 一只，手套 $0.0285。整数「分」到这里就不够用了：
   * 0.085 只能存成 8 或 9 分，一张 72 万只的单据会差出四千多美元。
   * 单价的精度要求本来就比金额高一个量级 —— 汇率用 E6，单价用 E4，
   * 金额仍然是整数分。这是外贸单据的通行口径（PI 上单价打 4 位小数）。
   */
  unitPriceE4: number;
  /** 采购单价 × 10000，人民币。业务员看不到这一列，见 lib/perms.ts */
  costE4: number;
  /** 每箱数量。0 = 不按箱走（散货、按重量计） */
  packQty: number;
  /** 每箱毛重，克 */
  grossWeightG: number;
  /** 每箱体积，立方厘米 */
  volumeCm3: number;
  note: string | null;
};

/**
 * 行金额，分。
 *
 * `qty × E4 / 100` —— 先乘后除，别先把 E4 换成小数再乘，
 * 那一步就把浮点误差请进来了。种子里刻意让 qty 是 100 的倍数，
 * 这个除法是整除，一分钱的尾差都不会有。
 */
export const lineAmount = (l: Pick<PiLine, "qty" | "unitPriceE4">) => Math.round((l.qty * l.unitPriceE4) / 100);

/** 行成本，人民币分 */
export const lineCost = (l: Pick<PiLine, "qty" | "costE4">) => Math.round((l.qty * l.costE4) / 100);

/** 单价转成可显示的数值 */
export const e4 = (v: number) => v / 10_000;

/** 箱数：不足一箱算一箱 —— 货代按整箱收，装箱单上也不存在 0.4 箱 */
export const lineCartons = (l: Pick<PiLine, "qty" | "packQty">) => (l.packQty > 0 ? Math.ceil(l.qty / l.packQty) : 0);

/**
 * 附件。
 *
 * 外贸是单据驱动的行业：PI 盖章件、提单扫描、水单截图、验货报告。
 * 一个不能把水单挂到收款单上的财务系统，财务不会用。
 *
 * 文件本体不进这条 `Database` 记录 —— 几十 MB 的扫描件混进主库，
 * 每次改一个字段都要把它们重新序列化一遍。本体存 IndexedDB 的 files
 * store（见 data/files.ts），这里只留一个键和一份元信息。
 */
export type Attachment = {
  id: string;
  /** 挂在谁身上：pi | shipment | payment | customer | quote | inquiry | sample | contract */
  entity: string;
  entityId: string;
  name: string;
  /** 字节 */
  size: number;
  mime: string;
  /** files store 里的键。演示占位件没有本体，是 null */
  blobKey: string | null;
  /** 演示账套里的占位附件：有元信息、没有文件，点下载会说明原因 */
  placeholder: boolean;
  /** 单据类型：合同 / 水单 / 提单 / 验货报告 … 用来分组和做齐套检查 */
  kind: string;
  uploadedBy: string | null;
  uploaderName: string;
  uploadedAt: string;
  note: string | null;
};

/**
 * 客户联系人。
 *
 * 原来 `Customer.contact` 是一个字符串。真实客户有采购、财务、收货三个人，
 * 各有各的邮箱和时区，报价发给采购、对账发给财务、到货通知发给仓库 ——
 * 一个字符串装不下一个 CRM。
 */
export type Contact = {
  id: string;
  customerId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  /** WhatsApp / WeChat / Skype，外贸沟通的主战场往往不是邮箱 */
  im: string | null;
  /** 决策人 | 采购 | 财务 | 收货 | 其他 */
  duty: string;
  /** 主联系人。单据默认发给他 */
  primary: boolean;
  note: string | null;
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
  /**
   * 本批的商业发票号。
   * 分批出运时每一批各开各的发票 —— 金额、数量、柜号都不同，
   * 共用一个号会让客户的财务和清关行对不上账。
   */
  invoiceNo?: string | null;
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

/**
 * 某一批实际出运了哪些货、各多少。
 *
 * ── 为什么非有不可 ──
 * 一张 PI 分 4 批出运是常态（工厂产能、客户仓位、船期都能导致分批）。
 * 在这张表之前，`Shipment` 只有 `piId` 和一个「第 4 批」的文字标签，
 * **系统不知道第 4 批里装的是什么、多少件**。于是给第 4 批开装箱单，
 * 打出来的是整张 PI 的 8 万件和总箱数 —— 柜号是对的，数量是错的。
 * 那张纸是要拿去清关的。
 *
 * ── 箱数重量为什么可以留空 ──
 * 多数时候按 PiLine 的包装参数推算就够准（`ceil(qty / packQty)`）。
 * 但实际装柜经常有零头箱、混装箱，货代给回来的数据才是准的 ——
 * 留空 = 按参数算，填了 = 以实际为准。不强制填，否则每一批都要手抄一遍。
 */
export type ShipmentLine = {
  id: string;
  shipmentId: string;
  piLineId: string;
  /** 本批实际出运数量 */
  qty: number;
  /** 实际箱数。null = 按 PiLine 的每箱数量推算 */
  cartons: number | null;
  /** 实际毛重（克）/ 体积（立方厘米），每箱。null = 用 PiLine 上的 */
  grossWeightG: number | null;
  volumeCm3: number | null;
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
  contacts: Contact[];
  sellerEntities: SellerEntity[];
  pis: Pi[];
  piLines: PiLine[];
  costings: OrderCosting[];
  shipments: Shipment[];
  /** 每批实际装了什么。见 ShipmentLine —— 分批 CI/PL 的数量来源 */
  shipmentLines: ShipmentLine[];
  milestones: ShipmentMilestone[];
  notes: ShipmentNote[];
  taxInvoices: TaxInvoice[];
  fxRates: FxRate[];
  auditLogs: AuditLog[];
  savedViews: SavedView[];
  attachments: Attachment[];
  credentials: Credential[];
  /** 采购协同与资金侧，见 ops-types.ts */
  ops: import("./ops-types").OpsData;
  /** 售前漏斗：询盘 / 报价 / 样品，见 presales-types.ts */
  presales: import("./presales-types").PresalesData;
  /** 审批 / 通知 / 往来 / 自定义字段，见 flow-types.ts */
  flow: import("./flow-types").FlowData;
  /**
   * 上次导出 JSON 的时刻。
   * 本地备份挡不住换电脑和清空站点数据，导出文件才挡得住 ——
   * 所以「多久没导出了」是个要盯着的指标，不是流水账。
   */
  lastExportAt: string | null;
};

export const DB_VERSION = 15;

/** 溢短装默认 ±5%，外贸合同上最常见的一档 */
export const DEFAULT_MORE_OR_LESS_BP = 500;

/** 演示口令：登录页会直接写出来，没什么好藏的 */
export const DEMO_PASSWORD = "demo1234";

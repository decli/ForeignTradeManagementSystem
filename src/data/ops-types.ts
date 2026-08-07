/**
 * 采购协同与资金侧的数据模型。
 *
 * 外贸的钱和货是两条线，原来只建了「货」那条（PI → 出运 → 退税）。
 * 这里补上「货怎么来」和「钱怎么走」：
 *
 *   询价单 ──比价──▶ 采购合同 ──下单──▶ 生产单 ──交货──▶ 出运批次
 *      │                  │                                  │
 *      └── 供应商 ────────┘                                  │
 *                         付款计划 ◀── 收付款 ──▶ 应收 ◀──────┘
 *
 * 金额仍然一律用整数「分」，跟主模型一条约定。
 */

export type Supplier = {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  category: string;
  contact: string | null;
  phone: string | null;
  province: string;
  /** 账期天数，0 = 款到发货 */
  termDays: number;
  /** 综合评分 0–100：交期、品质、配合度的加权 */
  score: number;
  /** 资质到期日，过期就不能下单 */
  certExpiry: string | null;
  taxNo: string | null;
  bank: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  nameEn?: string;
  category: string;
  /** HS 编码 —— 报关和退税率都从这取 */
  hsCode: string;
  /** 出口退税率，基点。1300 = 13% */
  refundRateBp: number;
  unit: string;
  /** 最近一次采购单价，分 */
  lastCostCents: number;
  /** 标准包装：每箱数量 */
  packQty: number;
  /** 每箱毛重，克 */
  grossWeightG: number;
  /** 每箱体积，立方厘米 */
  volumeCm3: number;
  active: boolean;
  note: string | null;
};

/** 询价单：一次询多家，横向比价 */
export type Rfq = {
  id: string;
  rfqNo: string;
  productId: string;
  qty: number;
  /** 期望交期 */
  wantedBy: string | null;
  /** open | quoted | closed */
  status: string;
  ownerId: string | null;
  /** 中标的报价 id */
  awardedQuoteId: string | null;
  createdAt: string;
  note: string | null;
};

export type RfqQuote = {
  id: string;
  rfqId: string;
  supplierId: string;
  /** 报价单价，分 */
  unitPriceCents: number;
  /** 承诺交期天数 */
  leadDays: number;
  /** 报价有效期 */
  validUntil: string | null;
  moq: number;
  note: string | null;
};

/** 采购合同：跟供应商签的那张纸 */
export type PurchaseContract = {
  id: string;
  contractNo: string;
  supplierId: string;
  /** 关联的销售 PI，可空（备货单没有） */
  piId: string | null;
  productId: string;
  qty: number;
  unitPriceCents: number;
  amountCents: number;
  signedOn: string;
  deliveryBy: string | null;
  /** 付款条件，如「30% 定金 + 70% 见提单」 */
  terms: string;
  /** draft | signed | executing | closed */
  status: string;
  /** 已付金额，分 */
  paidCents: number;
  createdAt: string;
};

/** 生产单：下给工厂的生产指令 */
export type ProductionOrder = {
  id: string;
  orderNo: string;
  contractId: string | null;
  supplierId: string;
  productId: string;
  piId: string | null;
  qty: number;
  /** 已完成数量 */
  doneQty: number;
  startOn: string | null;
  dueOn: string;
  /** pending | producing | inspecting | done | delayed */
  status: string;
  /** 验货结果：pass | fail | null（未验） */
  qcResult: string | null;
  qcOn: string | null;
  note: string | null;
  createdAt: string;
};

/** 收付款流水 */
export type Payment = {
  id: string;
  paymentNo: string;
  /** in = 收汇（客户付我们）；out = 付汇（我们付供应商） */
  direction: "in" | "out";
  /** 收汇挂 PI，付汇挂采购合同 */
  piId: string | null;
  contractId: string | null;
  counterparty: string;
  currency: string;
  amountCents: number;
  /** 折算成人民币的金额，分 */
  cnyCents: number;
  rateE6: number;
  paidOn: string;
  /** 银行账户 */
  accountId: string | null;
  /** pending | confirmed | reconciled */
  status: string;
  /** 水单号 / 回单号 */
  voucherNo: string | null;
  note: string | null;
};

export type BankAccount = {
  id: string;
  name: string;
  bank: string;
  accountNo: string;
  currency: string;
  /** 期初余额，分 */
  openingCents: number;
  active: boolean;
};

export type OpsData = {
  suppliers: Supplier[];
  products: Product[];
  rfqs: Rfq[];
  rfqQuotes: RfqQuote[];
  contracts: PurchaseContract[];
  productions: ProductionOrder[];
  payments: Payment[];
  accounts: BankAccount[];
  stock: StockItem[];
  lanes: FreightLane[];
  freightQuotes: FreightQuote[];
  docs: DocRecord[];
  logins: LoginLog[];
};

export const CONTRACT_STATUS: Record<string, string> = {
  draft: "草稿",
  signed: "已签订",
  executing: "执行中",
  closed: "已关闭",
};

export const PRODUCTION_STATUS: Record<string, string> = {
  pending: "待排产",
  producing: "生产中",
  inspecting: "待验货",
  done: "已完工",
  delayed: "已延期",
};

export const RFQ_STATUS: Record<string, string> = {
  open: "询价中",
  quoted: "已报价",
  closed: "已定标",
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: "待确认",
  confirmed: "已确认",
  reconciled: "已核销",
};

/* ═══════ 库存 / 运费 / 单证 / 登录 ═══════ */

/** 库存：一个产品在一个仓的一个批次 */
export type StockItem = {
  id: string;
  productId: string;
  warehouse: string;
  /** 生产批号，医疗器械出口必须能追溯到批 */
  lotNo: string;
  qty: number;
  /** 已被 PI 锁定的数量，可用 = qty - lockedQty */
  lockedQty: number;
  /** 锁给了哪张 PI */
  lockedPiId: string | null;
  /** 最近一次入库日，库龄从这里算 */
  inboundOn: string;
  /** 有效期。防护用品和医疗器械都有，过期就只能报废 */
  expiryOn: string | null;
  note: string | null;
};

/** 运费询价：一条航线一次询价 */
export type FreightLane = {
  id: string;
  laneNo: string;
  pol: string;
  pod: string;
  country: string;
  /** 海运 | 空运 */
  mode: string;
  askedOn: string;
  /** open | quoted | booked */
  status: string;
  awardedQuoteId: string | null;
  note: string | null;
};

export type FreightQuote = {
  id: string;
  laneId: string;
  forwarder: string;
  /** 20GP / 40HQ 报价，分。空运走 perKgCents */
  price20Cents: number;
  price40Cents: number;
  perKgCents: number;
  /** 航程天数 */
  transitDays: number;
  /** 每周船期班次 */
  sailings: number;
  validUntil: string;
  note: string | null;
};

/** 单证：挂在出运批次上的一份文件 */
export type DocRecord = {
  id: string;
  shipmentId: string;
  /** 提单 / 产地证 / FORM E … */
  kind: string;
  docNo: string | null;
  issuedOn: string | null;
  /** pending | issued | filed */
  status: string;
  note: string | null;
};

/** 登录记录 */
export type LoginLog = {
  id: string;
  userId: string;
  at: string;
  ip: string;
  device: string;
  /** password | google | demo */
  method: string;
  ok: boolean;
  /** 异地 / 异常时段等风险提示，没有就是 null */
  risk: string | null;
};

export const STOCK_WAREHOUSES = ["厦门保税仓", "义乌中转仓", "深圳前海仓"] as const;

/** 目的国 → 出口时必须随附的优惠原产地证。给错了客户清关要多交关税 */
export const FORM_BY_COUNTRY: Record<string, string> = {
  韩国: "FORM K",
  日本: "FORM E",
  新加坡: "FORM E",
  印尼: "FORM E",
  马来西亚: "FORM E",
  泰国: "FORM E",
  越南: "FORM E",
  智利: "FORM F",
  秘鲁: "FORM R",
  澳大利亚: "FORM AU",
  新西兰: "FORM N",
  巴基斯坦: "FORM P",
  瑞士: "FORM S",
};

/** 一票货的标准单证清单。缺哪份，清关就卡在哪份 */
export const DOC_KINDS = ["商业发票", "装箱单", "提单", "一般原产地证", "报关单"] as const;

export const DOC_STATUS: Record<string, string> = {
  pending: "待出具",
  issued: "已出具",
  filed: "已归档",
};

export const FREIGHT_STATUS: Record<string, string> = {
  open: "询价中",
  quoted: "已报价",
  booked: "已订舱",
};

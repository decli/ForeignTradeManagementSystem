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

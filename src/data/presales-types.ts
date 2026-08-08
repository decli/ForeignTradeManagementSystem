/**
 * 售前：询盘 → 报价 → 寄样 → 议价 → 转 PI。
 *
 * ── 为什么补这一段 ──
 * 系统原来从 PI 开始，但业务员 80% 的时间花在 PI **之前**。
 * 对业务员来说，一个从 PI 才开始的系统是「录入负担」；
 * 把询盘和报价接进来，它才变成「干活的工具」。
 *
 *   询盘 ──分配──▶ 报价（多版本议价）──▶ PI
 *     │                  │
 *     └── 寄样 ──────────┘
 *
 * ── 一条硬约定 ──
 * 报价单的明细行结构跟 `PiLine` 是**同构**的（品名/数量/单价/包装/HS）。
 * 转 PI 的时候整行搬过去就行，不需要一次「翻译」—— 翻译就是丢字段的地方。
 */

/** 询盘从哪来。渠道要能统计，不然投在阿里上的钱回报说不清 */
export const INQUIRY_SOURCES = ["阿里国际站", "独立站", "展会", "客户介绍", "老客户复购", "领英", "其他"] as const;

/**
 * 询盘状态。刻意不做成一条长流水线 —— 业务员只关心「这条还要不要跟」。
 * 报价发出之后状态由报价单接管，这里就停在 quoted。
 */
export const INQUIRY_STATUS: Record<string, string> = {
  new: "待处理",
  working: "跟进中",
  quoted: "已报价",
  won: "已成交",
  lost: "已流失",
};

/** 流失原因。要能统计，才知道是价格问题还是交期问题 */
export const LOST_REASONS = ["价格太高", "交期太长", "被同行截胡", "客户项目取消", "认证/资质不符", "起订量谈不拢", "失联", "其他"] as const;

export type Inquiry = {
  id: string;
  inquiryNo: string;
  /** 已建档客户；纯询盘阶段的潜客为 null，只留下面的散字段 */
  customerId: string | null;
  /** 潜客公司名 —— 还没建档时用它显示 */
  company: string;
  country: string;
  contactName: string | null;
  email: string | null;
  /** WhatsApp / WeChat */
  im: string | null;
  source: string;
  /** 客户问的东西，原文照录 */
  demand: string;
  /** 意向产品，可空 */
  productId: string | null;
  qty: number | null;
  unit: string;
  /** 目标单价，分（USD）。客户自己报的心理价，砍价时是锚 */
  targetPriceCents: number;
  status: string;
  /** 流失原因，status = lost 时有值 */
  lostReason: string | null;
  ownerId: string | null;
  /** 收到询盘的时刻。SLA 从这里算 */
  receivedAt: string;
  /** 第一次回复的时刻。null = 还没回过 —— SLA 红牌就看它 */
  firstReplyAt: string | null;
  /** 最近一次跟进 */
  lastTouchAt: string | null;
  /** 下次该跟进的日子 */
  nextFollowOn: string | null;
  note: string | null;
  createdAt: string;
};

/**
 * 首次响应时限，小时。
 *
 * 24 小时是外贸行业公认的分水岭：阿里国际站的排名权重直接跟它挂钩，
 * 欧美客户群发询价一般当天就在比谁先回。超过 48 小时基本等于放弃。
 */
export const SLA_WARN_HOURS = 12;
export const SLA_BREACH_HOURS = 24;

/* ═══════════════════ 报价单 ═══════════════════ */

/**
 * 贸易术语。只放外贸日常真会用的五个。
 *
 * `freight` / `insurance` 表示这个术语下**谁承担**这两笔：
 * 报价核算器据此决定要不要把海运费和保险费算进报价。
 * EXW 连出口国内段都不含，FOB 含到装船，CFR 含海运，CIF 再含保险，
 * DDP 一路含到客户仓库（含目的港清关和关税）。
 */
export type Incoterm = "EXW" | "FOB" | "CFR" | "CIF" | "DDP";

export const INCOTERMS: Array<{ code: Incoterm; zh: string; en: string; freight: boolean; insurance: boolean; destCharge: boolean }> = [
  { code: "EXW", zh: "工厂交货", en: "Ex Works", freight: false, insurance: false, destCharge: false },
  { code: "FOB", zh: "装运港船上交货", en: "Free On Board", freight: false, insurance: false, destCharge: false },
  { code: "CFR", zh: "成本加运费", en: "Cost and Freight", freight: true, insurance: false, destCharge: false },
  { code: "CIF", zh: "成本保险费加运费", en: "Cost, Insurance and Freight", freight: true, insurance: true, destCharge: false },
  { code: "DDP", zh: "完税后交货", en: "Delivered Duty Paid", freight: true, insurance: true, destCharge: true },
];

export const findIncoterm = (code: string) => INCOTERMS.find((i) => i.code === code) ?? INCOTERMS[1];

export const QUOTE_STATUS: Record<string, string> = {
  draft: "草稿",
  sent: "已发出",
  negotiating: "议价中",
  accepted: "客户接受",
  rejected: "客户拒绝",
  expired: "已过期",
  converted: "已转 PI",
};

export type Quotation = {
  id: string;
  quoteNo: string;
  /** 版本号，从 1 起。议价就是同一个 quoteNo 下的多个版本 */
  version: number;
  /** 上一版的 id。第一版是 null。让价轨迹靠这条链串起来 */
  prevId: string | null;
  inquiryId: string | null;
  customerId: string | null;
  company: string;
  country: string;
  contactId: string | null;
  currency: string;
  incoterm: Incoterm;
  /** 装运港，FOB 之后的术语要打在单据上 */
  pol: string;
  /** 目的港 */
  pod: string;
  /** 报价有效期。土耳其那种汇率波动大的市场只给 7 天 */
  validUntil: string;
  /** 交货期，天 */
  leadDays: number;
  /** 付款方式，如「30% T/T 定金，70% 见提单副本」 */
  payTerm: string;
  status: string;
  /** 这一版的让价理由 —— 议价轨迹上最值钱的一列 */
  revisionNote: string | null;
  /** 转成的 PI id */
  piId: string | null;
  ownerId: string | null;
  sellerEntityId: string | null;
  /** 核算参数快照，见 lib/quote-calc.ts。存下来才能复盘「当时按什么汇率报的」 */
  calc: QuoteCalcInput;
  createdAt: string;
  updatedAt: string;
};

/**
 * 报价核算的输入。**整份存进报价单**，不是算完就扔。
 *
 * 三个月后客户回来说「上次那个价还能做吗」，你要能立刻答出
 * 「当时按 6.72 报的，现在 7.05，同样利润率可以再让 2%」——
 * 没存汇率就只能重算一遍，而重算出来的不是当时那个数。
 */
export type QuoteCalcInput = {
  /** 采购汇率，E6。USD→CNY */
  rateE6: number;
  /** 海运费总额，人民币分。CFR 及以上才计入 */
  freightCents: number;
  /** 保险费率，基点。CIF 惯例按 CIF 货值的 110% 投保 */
  insuranceRateBp: number;
  /** 出口国内费用（拖车、报关、港杂），人民币分 */
  localCents: number;
  /** 银行手续费率，基点 */
  bankRateBp: number;
  /** 目的港清关 + 关税，人民币分。只有 DDP 才有 */
  destCents: number;
  /** 目标利润率，基点。反算模式下由它推出报价 */
  targetMarginBp: number;
  /** 退税是否计入收益。多数公司算的是「含退税的净利」 */
  refundCounted: boolean;
};

/** 报价明细行。字段跟 PiLine 对齐，转 PI 时整行搬 */
export type QuoteLine = {
  id: string;
  quoteId: string;
  seq: number;
  productId: string | null;
  name: string;
  nameEn: string | null;
  hsCode: string | null;
  refundRateBp: number;
  qty: number;
  unit: string;
  /** 成交单价 × 10000，报价币种。为什么是 E4 不是分，见 PiLine */
  unitPriceE4: number;
  /** 采购单价 × 10000，人民币 */
  costE4: number;
  packQty: number;
  grossWeightG: number;
  volumeCm3: number;
  note: string | null;
};

/* ═══════════════════ 样品单 ═══════════════════ */

export const SAMPLE_STATUS: Record<string, string> = {
  requested: "待寄出",
  sent: "已寄出",
  delivered: "客户已收",
  feedback: "已反馈",
  closed: "已关闭",
};

/**
 * 寄样。
 *
 * 寄样是外贸最容易掉链子的一环：样品寄出去就没下文了。
 * 所以这里有两个日期字段而不是一个 —— `sentOn` 是我们做的事，
 * `followOn` 是**该催客户的日子**。列表默认按后者排序。
 */
export type SampleOrder = {
  id: string;
  sampleNo: string;
  inquiryId: string | null;
  customerId: string | null;
  company: string;
  country: string;
  productId: string | null;
  productName: string;
  qty: number;
  /** 样品费，分（USD）。0 = 免费样 */
  feeCents: number;
  /** 运费谁出：我方 | 客户到付 */
  freightBy: string;
  courier: string | null;
  trackingNo: string | null;
  status: string;
  requestedOn: string;
  sentOn: string | null;
  deliveredOn: string | null;
  /** 该催客户反馈的日子 */
  followOn: string | null;
  /** 客户反馈原文 */
  feedback: string | null;
  ownerId: string | null;
  note: string | null;
};

export type PresalesData = {
  inquiries: Inquiry[];
  quotes: Quotation[];
  quoteLines: QuoteLine[];
  samples: SampleOrder[];
};

export const emptyPresales = (): PresalesData => ({ inquiries: [], quotes: [], quoteLines: [], samples: [] });

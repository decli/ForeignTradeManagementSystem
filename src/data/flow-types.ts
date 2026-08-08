/**
 * 管理侧的四件事：审批、通知、往来沟通、自定义字段。
 *
 * 这一层跟业务单据不同 —— 它不产生货和钱，它决定**谁能拍板、谁该知道**。
 * 老板买管理系统，一半是为了这一层。
 */

/* ═══════════════════ 审批流 ═══════════════════ */

/**
 * 审批场景。刻意做成**枚举而不是自由配置**。
 *
 * 通用工作流引擎（拖节点、连线、写条件表达式）在外贸公司落不了地：
 * 没人配得动，实施顾问走了就再也没人敢改。外贸真正要卡的就这四件事，
 * 每件的触发条件是硬编码的业务规则，用户只配「谁审、多少钱以上要审」。
 */
export const APPROVAL_KINDS: Record<string, { zh: string; en: string; why: string }> = {
  low_margin: { zh: "低利润率订单", en: "Low-margin order", why: "利润率低于红线的单子，签之前必须有人拍板" },
  discount: { zh: "报价特价", en: "Special price", why: "低于标准价的报价，让价幅度要留痕" },
  credit: { zh: "超额度放账", en: "Over credit limit", why: "客户在保额度不够还要发货，风险敞口得有人认" },
  payment: { zh: "付款申请", en: "Payment request", why: "付给供应商的钱，出纳不能一个人说了算" },
};

export const APPROVAL_STATUS: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
};

/**
 * 审批规则：什么情况下要审、谁来审。
 *
 * `threshold` 的含义随 kind 而变（利润率是基点，金额是分），
 * 所以每条规则自带一个人话说明，配置页直接显示，不让用户猜单位。
 */
export type ApprovalRule = {
  id: string;
  kind: string;
  enabled: boolean;
  /** 触发阈值。低利润率 = 基点；金额类 = 分 */
  threshold: number;
  /** 审批人（用户 id）按顺序走完。一级审批就只填一个 */
  approverIds: string[];
  note: string | null;
};

export type ApprovalStep = {
  approverId: string;
  approverName: string;
  /** pending | approved | rejected */
  state: string;
  at: string | null;
  comment: string | null;
};

export type ApprovalRequest = {
  id: string;
  requestNo: string;
  kind: string;
  /** 挂在哪张单据上 */
  entity: string;
  entityId: string;
  entityLabel: string;
  /** 一句话说清「要批什么」，审批人不用点进去就能判断 */
  summary: string;
  /** 触发这次审批的那个数（利润率基点 / 金额分），列表里要显示 */
  amount: number;
  currency: string;
  requesterId: string | null;
  requesterName: string;
  reason: string | null;
  status: string;
  steps: ApprovalStep[];
  /** 当前走到第几步 */
  cursor: number;
  createdAt: string;
  closedAt: string | null;
};

/* ═══════════════════ 通知 ═══════════════════ */

/**
 * 通知。
 *
 * ── 为什么单独做一层 ──
 * 站内所有预警（交期、额度、资质到期、停滞、超支）原来都是「你打开那一页才看得见」。
 * 预警的价值在于**追着人跑**，躺在页面里的预警等于没有。
 *
 * ── 为什么不存快照，而是每次算 ──
 * 派生型通知（某单超期了）由 `lib/notify.ts` 从当前数据实时推导 ——
 * 单子改好了通知就自动消失，不需要谁去「关闭」它。
 * 只有**事件型**通知（有人 @ 你、审批到你了）才落库，因为它们发生过就是发生过。
 */
export type Notification = {
  id: string;
  /** approval | mention | assign | system */
  kind: string;
  /** 收件人。null = 所有人 */
  userId: string | null;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  at: string;
};

/* ═══════════════════ 往来沟通 ═══════════════════ */

export const MSG_CHANNELS = ["邮件", "WhatsApp", "微信", "电话", "会面", "其他"] as const;

/**
 * 一条往来记录。
 *
 * ── 为什么现在是手工归档，不是邮箱同步 ──
 * 真正的邮箱同步要 IMAP/OAuth 和一个常驻服务，纯静态站没有落脚点。
 * 但**数据结构按同步来设计**：`externalId` / `direction` / `at` 都是
 * 邮件协议那套字段，将来接上 IMAP，这张表原样接收，UI 一行不用改。
 *
 * ── 手工归档也不是没用 ──
 * 老板要的「业务员离职，客户往来带不走」，靠的是记录**在公司库里**，
 * 而不是靠它怎么进来的。粘贴归档能覆盖最关键的那几封（报价、索赔、变更确认）。
 */
export type Message = {
  id: string;
  customerId: string | null;
  /** 可选：挂到具体单据上 */
  entity: string | null;
  entityId: string | null;
  channel: string;
  /** in = 客户发来；out = 我们发出 */
  direction: "in" | "out";
  subject: string;
  body: string;
  /** 对方是谁 */
  party: string;
  /** 我方经手人 */
  userId: string | null;
  userName: string;
  at: string;
  /** 邮件同步接上之后的原始 Message-ID，用来去重。手工录入是 null */
  externalId: string | null;
  /** 附件 id 列表 */
  attachmentIds: string[];
};

/* ═══════════════════ 自定义字段 ═══════════════════ */

/**
 * 自定义字段。
 *
 * 每家外贸公司总有两三个自己的字段（客户来源、产品认证、指定货代）。
 * 没有这个能力，实施阶段第一周就会卡死在「这个字段能不能加」。
 *
 * 值存在实体的 `ext` 里（一个 Record<string, string>），不改主表结构 ——
 * 用户加字段不该触发数据迁移。
 */
export type CustomFieldDef = {
  id: string;
  /** customer | pi | product | supplier */
  entity: string;
  /** 存进 ext 的键。定了就不给改，改了历史值会对不上 */
  key: string;
  label: string;
  labelEn: string | null;
  /** text | number | date | select */
  type: string;
  /** type = select 时的选项 */
  options: string[];
  required: boolean;
  /** 显示在列表页的列里 */
  inList: boolean;
  order: number;
  hint: string | null;
};

export const CF_TYPES: Record<string, string> = { text: "文本", number: "数字", date: "日期", select: "下拉选项" };

export const CF_ENTITIES: Record<string, string> = { customer: "客户", pi: "PI", product: "产品", supplier: "供应商" };

export type FlowData = {
  approvalRules: ApprovalRule[];
  approvals: ApprovalRequest[];
  notifications: Notification[];
  messages: Message[];
  customFields: CustomFieldDef[];
};

export const emptyFlow = (): FlowData => ({
  approvalRules: [],
  approvals: [],
  notifications: [],
  messages: [],
  customFields: [],
});

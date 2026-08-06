/** 信息架构：侧栏分组与模块清单。已实现的模块有 href，其余走 /m/[slug] 占位页。 */

export type NavItem = {
  slug: string;
  title: string;
  /** 已实现并接了数据库 */
  built?: boolean;
  href?: string;
  /** 占位页上的一句话定位 */
  desc?: string;
  /** 占位页上的功能范围标签 */
  scope?: string[];
};

export type NavGroup = { title: string; icon: keyof typeof NAV_ICONS; items: NavItem[] };

export const NAV_ICONS = {
  biz: '<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>',
  sales: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11h4M19 9v4"/>',
  buy: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12h11.2L21 7H6"/>',
  ship: '<path d="M3 17c1.5 1 3 1 4.5 0S10.5 16 12 17s3 1 4.5 0S19.5 16 21 17"/><path d="M5 14V8h14l-2 6"/><path d="M12 8V4"/>',
  fin: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sys: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
} as const;

export const NAV: NavGroup[] = [
  {
    title: "经营",
    icon: "biz",
    items: [
      { slug: "dashboard", title: "数据看板", desc: "全局经营视图：在跟订单额、出运柜量、利润率预警、退税进度，以及「今天要处理什么」清单。", scope: ["KPI 与趋势", "风险清单", "业务员业绩", "目的国分布"] },
    ],
  },
  {
    title: "业务",
    icon: "sales",
    items: [
      { slug: "customers", title: "客户管理", desc: "客户主档、跟进记录与中信保额度占用。", scope: ["客户档案", "额度占用", "跟进记录", "当地时间"] },
      { slug: "pi", title: "PI 取号", desc: "统一编号规则，取号即建档，后续跟单 / 核算 / 退税全靠这个号串联。", scope: ["号段规则", "重号校验", "作废与补号", "取号人留痕"] },
      { slug: "my-orders", title: "我的订单", desc: "业务员视角的订单列表，只看自己的单，默认按待办紧急度排序。", scope: ["我的待办", "回款提醒", "出运进度", "快速新建 PI"] },
      { slug: "stock", title: "库存管理", desc: "现货与备货库存，支持按 PI 锁库。", scope: ["入库 / 出库", "按 PI 锁库", "库龄预警", "盘点单"] },
    ],
  },
  {
    title: "采购协同",
    icon: "buy",
    items: [
      { slug: "rfq", title: "询价单", desc: "一次询多家供应商，横向比价后一键转生产单。", scope: ["多供应商比价", "历史价对比", "转生产单"] },
      { slug: "production", title: "生产单", desc: "下给工厂的生产指令，跟踪排产与交期。", scope: ["排产进度", "交期预警", "验货节点", "变更留痕"] },
      { slug: "purchase-contract", title: "采购合同", desc: "合同条款、付款节奏与实际付款的对账。", scope: ["条款模板", "付款计划", "执行对账", "盖章件归档"] },
      { slug: "products", title: "产品管理", desc: "产品主档，HS 编码与退税率挂这里，退税计算直接取。", scope: ["HS 编码", "退税率", "规格包装", "历史成本"] },
      { slug: "suppliers", title: "供应商管理", desc: "供应商档案、资质有效期与供货评分。", scope: ["资质到期提醒", "供货评分", "开票信息", "账期"] },
    ],
  },
  {
    title: "跟单",
    icon: "ship",
    items: [
      { slug: "follow-ups", title: "跟单表", built: true, href: "/follow-ups" },
      { slug: "freight", title: "运费询价", desc: "按航线比价货代，中标价直接带入订单成本。", scope: ["航线比价", "有效期提醒", "带入订单成本"] },
      { slug: "documents", title: "单证备案", desc: "提单、产地证、FORM 系列、清关文件的归档与齐套检查。", scope: ["齐套检查", "版本管理", "到期提醒", "打包下载"] },
    ],
  },
  {
    title: "财务",
    icon: "fin",
    items: [
      { slug: "orders", title: "订单核算跟踪", desc: "每个 PI 一行，成本超支自动进入复核；可下钻看成本构成与收付款进度。", scope: ["利润率预警", "成本构成", "收付款进度", "Excel 导入导出"] },
      { slug: "sinosure", title: "中信保客户信息", desc: "投保客户的限额、账期与在保余额。", scope: ["限额占用", "账期监控", "超限预警", "报损流程"] },
      { slug: "invoice-info", title: "开票资料", desc: "开票抬头与税务信息主档。", scope: ["抬头档案", "税号校验", "开票申请"] },
      { slug: "seller-entities", title: "PI 卖方档案", desc: "多个开票主体的抬头、账户与签章，PI 上按需选择。", scope: ["主体档案", "银行账户", "签章模板"] },
      { slug: "payments", title: "收付款 / 财务", desc: "收汇与付汇的登记、认领与核销。", scope: ["水单认领", "自动核销", "汇率锁定", "未核销预警"] },
      { slug: "tax-refund", title: "退税管理", desc: "出口退税发票明细台账，未关联订单的行会标红并可一键挂到 PI。", scope: ["按主体分账", "未关联提醒", "税额合计", "Excel 导入导出"] },
      { slug: "bank-journal", title: "银行日记账", desc: "银行流水导入与自动匹配收付款单。", scope: ["流水导入", "自动匹配", "余额对账", "多账户"] },
      { slug: "funds", title: "资金汇总", desc: "多币种多账户的资金池与现金流预测。", scope: ["多币种余额", "现金流预测", "资金调拨"] },
      { slug: "expenses", title: "费用明细报表", desc: "按订单 / 部门 / 科目的费用穿透查询。", scope: ["按订单穿透", "科目汇总", "同比环比"] },
      { slug: "accounts", title: "账户与科目", desc: "银行账户与会计科目主档。", scope: ["账户档案", "科目树", "启用停用"] },
    ],
  },
  {
    title: "分析",
    icon: "chart",
    items: [
      { slug: "commission", title: "提成与绩效", desc: "按利润率阶梯自动算提成，业务员可自查。", scope: ["提成规则", "自动试算", "月度封账", "个人自查"] },
      { slug: "reports", title: "报表中心", desc: "常用报表的集中出口，支持自定义筛选后导出。", scope: ["预置报表", "自定义筛选", "定时推送", "导出 Excel"] },
    ],
  },
  {
    title: "系统",
    icon: "sys",
    items: [
      { slug: "settings", title: "系统设置与权限", desc: "角色、数据范围、字段级可见性与字典维护。", scope: ["角色权限", "数据范围", "字段可见性", "数据字典"] },
      { slug: "audit", title: "审计日志", desc: "所有写操作留痕，可按人 / 单据 / 时间回查改动前后值。", scope: ["前后对比", "按单据回查", "导出"] },
      { slug: "logins", title: "登录记录", desc: "登录时间、IP 与设备，异常登录提醒。", scope: ["登录明细", "异常提醒", "强制下线"] },
    ],
  },
];

const INDEX = new Map<string, NavItem>();
for (const g of NAV) for (const it of g.items) INDEX.set(it.slug, it);

export const findNavItem = (slug: string) => INDEX.get(slug);
export const navHref = (it: NavItem) => it.href ?? `/m/${it.slug}`;

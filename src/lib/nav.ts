/** 信息架构：侧栏分组与模块清单。已实现的模块有 href，其余走 /m/:slug 占位页。 */

import type { IconName } from "@/components/Icon";
import type { Role } from "@/data/types";

export type NavItem = {
  slug: string;
  title: string;
  /** 英文名。菜单是产品的骨架，英文版必须完整，不能靠词条表兜底 */
  titleEn?: string;
  /** 已实现并接了数据 */
  built?: boolean;
  href?: string;
  icon?: IconName;
  /** 占位页上的一句话定位 */
  desc?: string;
  /** 占位页上的功能范围标签 */
  scope?: string[];
  /** 哪些角色能看到。不写 = 所有角色 */
  roles?: Role[];
};

export type NavGroup = { title: string; icon: IconName; items: NavItem[] };

/** 当前语言下这个模块叫什么 */
export const navTitle = (it: NavItem, lang: string) => (lang === "en" ? (it.titleEn ?? it.title) : it.title);

/**
 * 侧栏分组按**单据流转顺序**排，不按部门排。
 *
 * 原来的分法是「业务 / 采购 / 财务」—— 那是公司的组织结构，不是业务的走向。
 * 新人照着组织结构找不到"报完价接下来干什么"，照着流转顺序从上往下走一遍
 * 就是一整趟外贸：询盘 → 报价 → PI → 采购 → 出运 → 收款退税。
 *
 * 一个刻意的例外：**档案**（客户 / 产品 / 供应商）从流程里摘出来单独一组。
 * 它们不是流程的一环，是流程的输入 —— 混在业务分组里，
 * 会让人以为"客户管理"是某个步骤。
 */
export const NAV: NavGroup[] = [
  {
    title: "经营",
    icon: "building",
    items: [
      {
        slug: "dashboard",
        title: "数据看板", titleEn: "Dashboard",
        built: true,
        href: "/dashboard",
        icon: "chart",
        desc: "全局经营视图：在跟订单额、出运柜量、利润率预警、退税进度，以及「今天要处理什么」清单。",
        scope: ["KPI 与趋势", "风险清单", "业务员业绩", "目的国分布"],
      },
      {
        slug: "approvals",
        title: "审批中心", titleEn: "Approvals",
        built: true,
        href: "/approvals",
        icon: "check",
        desc: "低价单、特价报价、超额度放账、大额付款的审批入口，谁批的、批语是什么都留痕。",
        scope: ["待我审", "我发起的", "审批留痕", "规则配置"],
      },
    ],
  },
  {
    title: "售前",
    icon: "target",
    items: [
      {
        slug: "inquiries",
        title: "询盘管理", titleEn: "Inquiries",
        built: true,
        href: "/inquiries",
        icon: "inbox",
        desc: "阿里 / 独立站 / 展会来的询盘，分配到人、按时回、跟到底。超过 24 小时没回的会标红。",
        scope: ["首次响应 SLA", "来源统计", "售前漏斗", "流失原因"],
      },
      {
        slug: "quotes",
        title: "报价单", titleEn: "Quotations",
        built: true,
        href: "/quotes",
        icon: "tag",
        desc: "带核算器的报价：成本 + 运费 + 保险 − 退税，正算利润、反算报价；议价每让一次价留一版。",
        scope: ["FOB/CIF/DDP 核算", "目标利润率反算", "议价轨迹", "一键转 PI"],
      },
      {
        slug: "samples",
        title: "样品管理", titleEn: "Samples",
        built: true,
        href: "/samples",
        icon: "box",
        desc: "寄样登记、快递跟踪、到期催反馈。样品寄出去没下文是最常见的漏斗断点。",
        scope: ["寄样登记", "快递单号", "催反馈提醒", "样品费"],
      },
    ],
  },
  {
    title: "订单",
    icon: "tag",
    items: [
      { slug: "pi", title: "PI 取号", titleEn: "PI Numbers", built: true, href: "/pi", icon: "tag", desc: "统一编号规则，取号即建档，后续跟单 / 核算 / 退税全靠这个号串联。", scope: ["号段规则", "重号校验", "商品明细行", "取号人留痕"] },
      { slug: "my-orders", title: "我的订单", titleEn: "My Orders", built: true, href: "/my-orders", icon: "inbox", desc: "业务员视角的订单列表，只看自己的单，默认按待办紧急度排序。", scope: ["我的待办", "回款提醒", "出运进度", "快速新建 PI"] },
      { slug: "orders", title: "订单核算跟踪", titleEn: "Order Costing", built: true, href: "/orders", icon: "gauge", desc: "每个 PI 一行，成本超支自动进入复核；可下钻看成本构成、商品明细与收付款进度。", scope: ["利润率预警", "成本构成", "商品明细", "Excel 导出"] },
    ],
  },
  {
    title: "采购生产",
    icon: "cart",
    items: [
      { slug: "rfq", title: "询价单", titleEn: "RFQ", built: true, href: "/rfq", icon: "search", desc: "一次询多家供应商，横向比价后一键转生产单。", scope: ["多供应商比价", "历史价对比", "转生产单"] },
      { slug: "purchase-contract", title: "采购合同", titleEn: "Purchase Contracts", built: true, href: "/purchase-contract", icon: "file", desc: "合同条款、付款节奏与实际付款的对账。", scope: ["条款模板", "付款计划", "执行对账", "盖章件归档"] },
      { slug: "production", title: "生产单", titleEn: "Production Orders", built: true, href: "/production", icon: "play", desc: "下给工厂的生产指令，跟踪排产与交期。", scope: ["排产进度", "交期预警", "验货节点", "变更留痕"] },
      { slug: "stock", built: true, href: "/stock", title: "库存管理", titleEn: "Inventory", icon: "box", desc: "现货与备货库存，支持按 PI 锁库。", scope: ["入库 / 出库", "按 PI 锁库", "库龄预警", "盘点单"] },
    ],
  },
  {
    title: "出运跟单",
    icon: "ship",
    items: [
      { slug: "follow-ups", title: "跟单表", titleEn: "Follow-ups", built: true, href: "/follow-ups", icon: "ship", desc: "出运跟踪台账，一行一个出运批次。", scope: ["里程碑航程线", "动态就地改", "批量更新", "停滞识别"] },
      { slug: "freight", built: true, href: "/freight", title: "运费询价", titleEn: "Freight Quotes", icon: "ship", desc: "按航线比价货代，中标价直接带入订单成本。", scope: ["航线比价", "有效期提醒", "带入订单成本"] },
      { slug: "documents", built: true, href: "/documents", title: "单证备案", titleEn: "Documents", icon: "file", desc: "提单、产地证、FORM 系列、清关文件的归档与齐套检查。", scope: ["齐套检查", "版本管理", "到期提醒", "打包下载"] },
    ],
  },
  {
    title: "收付退税",
    icon: "wallet",
    items: [
      { slug: "payments", built: true, href: "/payments", title: "收付款 / 财务", titleEn: "Payments", icon: "wallet", desc: "收汇与付汇的登记、认领与核销。", scope: ["水单认领", "自动核销", "汇率锁定", "未核销预警"] },
      {
        slug: "receivables",
        title: "应收账龄", titleEn: "Receivables Aging",
        built: true,
        href: "/receivables",
        icon: "clock",
        desc: "按 30 / 60 / 90 天分桶的应收台账，逾期的按客户和业务员穿透，附催收话术。",
        scope: ["账龄分桶", "逾期穿透", "客户风险", "催收清单"],
      },
      { slug: "tax-refund", title: "退税管理", titleEn: "VAT Refund", built: true, href: "/tax-refund", icon: "file", desc: "出口退税发票明细台账，未关联订单的行会标红并可一键挂到 PI。", scope: ["按主体分账", "未关联提醒", "税额合计", "Excel 导出"] },
      { slug: "bank-journal", built: true, href: "/bank-journal", title: "银行日记账", titleEn: "Bank Journal", icon: "database", desc: "银行流水导入与自动匹配收付款单。", scope: ["流水导入", "自动匹配", "余额对账", "多账户"] },
      { slug: "funds", built: true, href: "/funds", title: "资金汇总", titleEn: "Treasury", icon: "wallet", desc: "多币种多账户的资金池与现金流预测。", scope: ["多币种余额", "现金流预测", "资金调拨"] },
      { slug: "expenses", built: true, href: "/expenses", title: "费用明细报表", titleEn: "Expense Report", icon: "pie", desc: "按订单 / 部门 / 科目的费用穿透查询。", scope: ["按订单穿透", "科目汇总", "同比环比"] },
      { slug: "sinosure", built: true, href: "/sinosure", title: "中信保客户信息", titleEn: "Credit Insurance", icon: "shield", desc: "投保客户的限额、账期与在保余额。", scope: ["限额占用", "账期监控", "超限预警", "报损流程"] },
    ],
  },
  {
    title: "档案",
    icon: "database",
    items: [
      { slug: "customers", title: "客户管理", titleEn: "Customers", built: true, href: "/customers", icon: "users", desc: "客户主档、多联系人、往来沟通归档与中信保额度占用。", scope: ["客户档案", "多联系人", "往来归档", "当地时间"] },
      { slug: "products", title: "产品管理", titleEn: "Products", built: true, href: "/products", icon: "tag", desc: "产品主档，HS 编码与退税率挂这里，报价核算与退税计算直接取。", scope: ["HS 编码", "退税率", "规格包装", "历史成本"] },
      { slug: "suppliers", title: "供应商管理", titleEn: "Suppliers", built: true, href: "/suppliers", icon: "building", desc: "供应商档案、资质有效期与供货评分。", scope: ["资质到期提醒", "供货评分", "开票信息", "账期"] },
      { slug: "seller-entities", built: true, href: "/seller-entities", title: "PI 卖方档案", titleEn: "Seller Entities", icon: "building", desc: "多个开票主体的抬头、账户与签章，PI 与单据上按需选择。", scope: ["主体档案", "银行账户", "签章模板"] },
      { slug: "invoice-info", built: true, href: "/invoice-info", title: "开票资料", titleEn: "Invoicing Profiles", icon: "file", desc: "开票抬头与税务信息主档。", scope: ["抬头档案", "税号校验", "开票申请"] },
      { slug: "accounts", built: true, href: "/accounts", title: "账户与科目", titleEn: "Accounts & Ledger", icon: "database", desc: "银行账户与会计科目主档。", scope: ["账户档案", "科目树", "启用停用"] },
    ],
  },
  {
    title: "分析",
    icon: "pie",
    items: [
      { slug: "reports", built: true, href: "/reports", title: "报表中心", titleEn: "Reports", icon: "chart", desc: "常用报表的集中出口，支持自定义筛选后导出。", scope: ["预置报表", "自定义筛选", "定时推送", "导出 Excel"] },
      { slug: "commission", built: true, href: "/commission", title: "提成与绩效", titleEn: "Commission", icon: "target", desc: "按利润率阶梯自动算提成，业务员可自查。", scope: ["提成规则", "自动试算", "月度封账", "个人自查"] },
    ],
  },
  {
    title: "系统",
    icon: "sliders",
    items: [
      { slug: "settings", title: "系统设置", titleEn: "Settings", built: true, href: "/settings", icon: "sliders", desc: "外观、表格密度、账套数据、备份与同步、自定义字段、审批规则。", scope: ["主题与密度", "备份与回滚", "自定义字段", "导入导出"] },
      { slug: "audit", title: "审计日志", titleEn: "Audit Log", built: true, href: "/audit", icon: "shield", desc: "所有写操作留痕，可按人 / 单据 / 时间回查改动前后值。", scope: ["前后对比", "按单据回查", "导出"] },
      { slug: "logins", built: true, href: "/logins", title: "登录记录", titleEn: "Sign-in History", icon: "key", desc: "登录时间、IP 与设备，异常登录提醒。", scope: ["登录明细", "异常提醒", "强制下线"] },
    ],
  },
];

const INDEX = new Map<string, NavItem>();
for (const g of NAV) for (const it of g.items) INDEX.set(it.slug, it);

export const findNavItem = (slug: string) => INDEX.get(slug);
export const navHref = (it: NavItem) => it.href ?? `/m/${it.slug}`;
export const ALL_ITEMS = [...INDEX.values()];

export function groupOf(slug: string) {
  return NAV.find((g) => g.items.some((i) => i.slug === slug));
}

/** 路由 → 面包屑。找不到就退回一个通用标题，不要出现空面包屑。 */
export function breadcrumb(pathname: string) {
  const slug = pathname.replace(/^\//, "").split("/")[0] || "dashboard";
  const key = slug === "m" ? pathname.split("/")[2] : slug;
  const item = findNavItem(key);
  const group = item ? groupOf(item.slug) : undefined;
  return { group: group?.title ?? "工作台", title: item?.title ?? "模块", item };
}

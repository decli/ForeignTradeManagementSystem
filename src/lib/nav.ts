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
    ],
  },
  {
    title: "业务",
    icon: "users",
    items: [
      { slug: "customers", title: "客户管理", titleEn: "Customers", built: true, href: "/customers", icon: "users", desc: "客户主档、跟进记录与中信保额度占用。", scope: ["客户档案", "额度占用", "跟进记录", "当地时间"] },
      { slug: "pi", title: "PI 取号", titleEn: "PI Numbers", built: true, href: "/pi", icon: "tag", desc: "统一编号规则，取号即建档，后续跟单 / 核算 / 退税全靠这个号串联。", scope: ["号段规则", "重号校验", "作废与补号", "取号人留痕"] },
      { slug: "my-orders", title: "我的订单", titleEn: "My Orders", built: true, href: "/my-orders", icon: "inbox", desc: "业务员视角的订单列表，只看自己的单，默认按待办紧急度排序。", scope: ["我的待办", "回款提醒", "出运进度", "快速新建 PI"] },
      { slug: "stock", built: true, href: "/stock", title: "库存管理", titleEn: "Inventory", icon: "box", desc: "现货与备货库存，支持按 PI 锁库。", scope: ["入库 / 出库", "按 PI 锁库", "库龄预警", "盘点单"] },
    ],
  },
  {
    title: "采购协同",
    icon: "cart",
    items: [
      { slug: "rfq", title: "询价单", titleEn: "RFQ", built: true, href: "/rfq", icon: "search", desc: "一次询多家供应商，横向比价后一键转生产单。", scope: ["多供应商比价", "历史价对比", "转生产单"] },
      { slug: "production", title: "生产单", titleEn: "Production Orders", built: true, href: "/production", icon: "play", desc: "下给工厂的生产指令，跟踪排产与交期。", scope: ["排产进度", "交期预警", "验货节点", "变更留痕"] },
      { slug: "purchase-contract", title: "采购合同", titleEn: "Purchase Contracts", built: true, href: "/purchase-contract", icon: "file", desc: "合同条款、付款节奏与实际付款的对账。", scope: ["条款模板", "付款计划", "执行对账", "盖章件归档"] },
      { slug: "products", title: "产品管理", titleEn: "Products", built: true, href: "/products", icon: "tag", desc: "产品主档，HS 编码与退税率挂这里，退税计算直接取。", scope: ["HS 编码", "退税率", "规格包装", "历史成本"] },
      { slug: "suppliers", title: "供应商管理", titleEn: "Suppliers", built: true, href: "/suppliers", icon: "building", desc: "供应商档案、资质有效期与供货评分。", scope: ["资质到期提醒", "供货评分", "开票信息", "账期"] },
    ],
  },
  {
    title: "跟单",
    icon: "ship",
    items: [
      { slug: "follow-ups", title: "跟单表", titleEn: "Follow-ups", built: true, href: "/follow-ups", icon: "ship", desc: "出运跟踪台账，一行一个出运批次。", scope: ["里程碑航程线", "动态就地改", "批量更新", "停滞识别"] },
      { slug: "freight", built: true, href: "/freight", title: "运费询价", titleEn: "Freight Quotes", icon: "ship", desc: "按航线比价货代，中标价直接带入订单成本。", scope: ["航线比价", "有效期提醒", "带入订单成本"] },
      { slug: "documents", built: true, href: "/documents", title: "单证备案", titleEn: "Documents", icon: "file", desc: "提单、产地证、FORM 系列、清关文件的归档与齐套检查。", scope: ["齐套检查", "版本管理", "到期提醒", "打包下载"] },
    ],
  },
  {
    title: "财务",
    icon: "wallet",
    items: [
      { slug: "orders", title: "订单核算跟踪", titleEn: "Order Costing", built: true, href: "/orders", icon: "gauge", desc: "每个 PI 一行，成本超支自动进入复核；可下钻看成本构成与收付款进度。", scope: ["利润率预警", "成本构成", "收付款进度", "Excel 导出"] },
      { slug: "sinosure", built: true, href: "/sinosure", title: "中信保客户信息", titleEn: "Credit Insurance", icon: "shield", desc: "投保客户的限额、账期与在保余额。", scope: ["限额占用", "账期监控", "超限预警", "报损流程"] },
      { slug: "invoice-info", built: true, href: "/invoice-info", title: "开票资料", titleEn: "Invoicing Profiles", icon: "file", desc: "开票抬头与税务信息主档。", scope: ["抬头档案", "税号校验", "开票申请"] },
      { slug: "seller-entities", built: true, href: "/seller-entities", title: "PI 卖方档案", titleEn: "Seller Entities", icon: "building", desc: "多个开票主体的抬头、账户与签章，PI 上按需选择。", scope: ["主体档案", "银行账户", "签章模板"] },
      { slug: "payments", built: true, href: "/payments", title: "收付款 / 财务", titleEn: "Payments", icon: "wallet", desc: "收汇与付汇的登记、认领与核销。", scope: ["水单认领", "自动核销", "汇率锁定", "未核销预警"] },
      { slug: "tax-refund", title: "退税管理", titleEn: "VAT Refund", built: true, href: "/tax-refund", icon: "file", desc: "出口退税发票明细台账，未关联订单的行会标红并可一键挂到 PI。", scope: ["按主体分账", "未关联提醒", "税额合计", "Excel 导出"] },
      { slug: "bank-journal", built: true, href: "/bank-journal", title: "银行日记账", titleEn: "Bank Journal", icon: "database", desc: "银行流水导入与自动匹配收付款单。", scope: ["流水导入", "自动匹配", "余额对账", "多账户"] },
      { slug: "funds", built: true, href: "/funds", title: "资金汇总", titleEn: "Treasury", icon: "wallet", desc: "多币种多账户的资金池与现金流预测。", scope: ["多币种余额", "现金流预测", "资金调拨"] },
      { slug: "expenses", built: true, href: "/expenses", title: "费用明细报表", titleEn: "Expense Report", icon: "pie", desc: "按订单 / 部门 / 科目的费用穿透查询。", scope: ["按订单穿透", "科目汇总", "同比环比"] },
      { slug: "accounts", built: true, href: "/accounts", title: "账户与科目", titleEn: "Accounts & Ledger", icon: "database", desc: "银行账户与会计科目主档。", scope: ["账户档案", "科目树", "启用停用"] },
    ],
  },
  {
    title: "分析",
    icon: "pie",
    items: [
      { slug: "commission", built: true, href: "/commission", title: "提成与绩效", titleEn: "Commission", icon: "target", desc: "按利润率阶梯自动算提成，业务员可自查。", scope: ["提成规则", "自动试算", "月度封账", "个人自查"] },
      { slug: "reports", built: true, href: "/reports", title: "报表中心", titleEn: "Reports", icon: "chart", desc: "常用报表的集中出口，支持自定义筛选后导出。", scope: ["预置报表", "自定义筛选", "定时推送", "导出 Excel"] },
    ],
  },
  {
    title: "系统",
    icon: "sliders",
    items: [
      { slug: "settings", title: "系统设置", titleEn: "Settings", built: true, href: "/settings", icon: "sliders", desc: "外观、表格密度、账套数据与登录账号。", scope: ["主题与密度", "账套导入导出", "本地账号", "重置演示数据"] },
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

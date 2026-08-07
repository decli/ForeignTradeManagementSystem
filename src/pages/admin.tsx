/**
 * 卖方档案 / 开票资料 / 提成与绩效 / 报表中心 / 登录记录。
 *
 * 这几页共同点是「主档 + 用它的地方」：光列字段没意义，得同时告诉人
 * 这条档案被谁用着、用了多少 —— 否则没人知道能不能停用它。
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { BarList } from "@/components/charts";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Kpi, Page, Panel, useParam } from "@/components/ui/PageKit";
import { Avatar, Bar, EmptyState, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT, personName } from "@/i18n";
import { centsToYuan, formatCny, formatCompact, formatInt, formatPct, relativeTime, todayIso } from "@/lib/format";

/* ═══════════════════ PI 卖方档案 ═══════════════════ */

export function SellerEntities() {
  const db = useDb();
  const { t } = useT();

  const rows = useMemo(() => {
    return db.sellerEntities.map((e) => {
      const pis = db.pis.filter((p) => p.sellerEntityId === e.id);
      const open = pis.filter((p) => p.status === "open");
      /* PI 金额是各自的币种，折人民币再加总，不然两个主体没法比 */
      const cny = pis.reduce((s, p) => s + centsToYuan(p.amountCents) * (p.currency === "CNY" ? 1 : p.currency === "EUR" ? 7.9 : 6.7), 0);
      const invoices = db.taxInvoices.filter((v) => v.sellerEntityId === e.id).length;
      return { ...e, piCount: pis.length, openCount: open.length, cny, invoices };
    });
  }, [db]);

  const total = rows.reduce((s, r) => s + r.cny, 0);

  return (
    <Page
      title={t("PI 卖方档案")}
      desc={t("多个开票主体的抬头、税号与账户。PI 取号时按需选择，退税也按主体分账")}
      kpis={
        <>
          <Kpi icon="building" k={t("开票主体")} v={formatInt(rows.length)} s={t("启用中")} />
          <Kpi icon="tag" k={t("累计 PI")} v={formatInt(rows.reduce((s, r) => s + r.piCount, 0))} s={t("按主体分布见下")} />
          <Kpi icon="wallet" k={t("签约金额")} v={formatCompact(total, "¥")} s={t("全部主体折人民币")} />
          <Kpi icon="file" k={t("退税发票")} v={formatInt(rows.reduce((s, r) => s + r.invoices, 0))} s={t("已录入的行数")} />
        </>
      }
    >
      <div className="entity-cards">
        {rows.map((e) => (
          <section key={e.id} className="card entity-card">
            <header className="card-head">
              <span className="entity-mark">
                <Icon name="building" />
              </span>
              <h3>{e.name}</h3>
              <span className="spacer" />
              <Pill tone={e.active ? "jade" : "mute"}>{e.active ? t("启用") : t("停用")}</Pill>
            </header>
            <div className="card-body">
              <div className="kv-grid">
                <div className="kv-row">
                  <span>{t("纳税人识别号")}</span>
                  <b className="num">{e.taxNo ?? "—"}</b>
                </div>
                <div className="kv-row">
                  <span>{t("开户银行")}</span>
                  <b>{e.bank ?? "—"}</b>
                </div>
              </div>
              <div className="entity-stats">
                <div>
                  <b className="num">{formatInt(e.piCount)}</b>
                  <span>{t("累计 PI")}</span>
                </div>
                <div>
                  <b className="num">{formatInt(e.openCount)}</b>
                  <span>{t("在跟")}</span>
                </div>
                <div>
                  <b className="num">{formatCompact(e.cny, "¥")}</b>
                  <span>{t("签约金额")}</span>
                </div>
                <div>
                  <b className="num">{formatInt(e.invoices)}</b>
                  <span>{t("退税发票")}</span>
                </div>
              </div>
              <Bar value={e.cny} max={Math.max(total, 1)} tone="accent" />
              <p className="entity-foot muted">
                {t("占全部签约额的 {p}", { p: formatPct(total ? (e.cny / total) * 100 : 0, 1) })}
              </p>
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

/* ═══════════════════ 开票资料 ═══════════════════ */

/** 统一社会信用代码：18 位，数字或大写字母。位数不对，退税一定被退回来 */
const taxNoOk = (s: string | null) => !!s && /^[0-9A-Z]{18}$/.test(s);

export function InvoiceInfo() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const view = get("view");

  /* 退税要用的是**供应商**的开票资料 —— 增票上的销方名称、税号、开户行
     必须跟采购合同和报关单对得上，缺一项，这张票的退税就走不下去。 */
  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    return db.ops.suppliers
      .map((s) => {
        const invoices = db.taxInvoices.filter((v) => v.sellerName === s.name);
        const gaps: string[] = [];
        if (!s.taxNo) gaps.push(t("缺税号"));
        else if (!taxNoOk(s.taxNo)) gaps.push(t("税号位数不对"));
        if (!s.bank) gaps.push(t("缺开户行"));
        if (!s.contact) gaps.push(t("缺联系人"));
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          taxNo: s.taxNo,
          bank: s.bank,
          contact: s.contact,
          phone: s.phone,
          province: s.province,
          invoices: invoices.length,
          amount: centsToYuan(invoices.reduce((a, v) => a + v.grossCents, 0)),
          gaps,
          ok: gaps.length === 0,
        };
      })
      .filter((r) => (view === "gap" ? !r.ok : true))
      .filter((r) => !key || `${r.name} ${r.code} ${r.taxNo ?? ""}`.toLowerCase().includes(key))
      .sort((a, b) => a.gaps.length === b.gaps.length ? b.amount - a.amount : b.gaps.length - a.gaps.length);
  }, [db, q, view, t]);

  const bad = rows.filter((r) => !r.ok);

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "name",
        title: t("开票名称"),
        width: 280,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.name.localeCompare(b.name),
        render: (r) => (
          <>
            <div className="cell-main truncate">{r.name}</div>
            <div className="cell-sub">
              <span className="num">{r.code}</span> · {r.province}
            </div>
          </>
        ),
      },
      {
        key: "tax",
        title: t("纳税人识别号"),
        width: 220,
        tip: t("统一社会信用代码 18 位。位数不对，这张票的退税走不下去"),
        render: (r) =>
          r.taxNo ? (
            <span className="num" style={{ color: taxNoOk(r.taxNo) ? undefined : "var(--coral)" }}>
              {r.taxNo}
            </span>
          ) : (
            <Pill tone="coral">{t("缺税号")}</Pill>
          ),
      },
      { key: "bank", title: t("开户银行"), width: 190, render: (r) => (r.bank ? <span>{r.bank}</span> : <Pill tone="amber">{t("待补")}</Pill>) },
      {
        key: "contact",
        title: t("联系人"),
        width: 150,
        render: (r) => (
          <>
            <div>{r.contact ?? "—"}</div>
            <div className="cell-sub num">{r.phone ?? "—"}</div>
          </>
        ),
      },
      {
        key: "inv",
        title: t("已开票"),
        width: 110,
        align: "right",
        sort: (a, b) => a.invoices - b.invoices,
        render: (r) => <span className="cell-num">{r.invoices || "—"}</span>,
      },
      {
        key: "amt",
        title: t("开票金额"),
        width: 140,
        align: "right",
        sort: (a, b) => a.amount - b.amount,
        render: (r) => <span className="cell-num">{r.amount ? formatCny(r.amount) : "—"}</span>,
      },
      {
        key: "state",
        title: t("资料完整度"),
        width: 200,
        render: (r) =>
          r.ok ? (
            <Pill tone="jade">{t("齐全")}</Pill>
          ) : (
            <span className="doc-miss">
              {r.gaps.map((g) => (
                <Pill key={g} tone="coral">
                  {g}
                </Pill>
              ))}
            </span>
          ),
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("开票资料")}
      desc={t("供应商增票抬头主档。销方名称、税号、开户行要跟采购合同和报关单对得上，退税才走得通")}
      kpis={
        <>
          <Kpi icon="file" k={t("开票主体")} v={formatInt(rows.length)} s={t("供应商开票资料")} />
          <Kpi icon="check" k={t("资料齐全")} v={formatInt(rows.filter((r) => r.ok).length)} s={t("可直接开票")} tone="jade" />
          <Kpi icon="alert" k={t("需补资料")} v={formatInt(bad.length)} s={t("会卡住退税")} tone={bad.length ? "coral" : "jade"} />
          <Kpi icon="wallet" k={t("累计开票")} v={formatCompact(rows.reduce((s, r) => s + r.amount, 0), "¥")} s={t("价税合计")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜名称 / 编码 / 税号…")} />
          <Segmented
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "gap", label: t("需补资料"), count: bad.length },
            ]}
          />
        </>
      }
    >
      <DataGrid
        gridId="invoice-info"
        rows={rows}
        columns={columns}
        getRowLabel={(r) => r.name}
        rowTone={(r) => (r.ok ? undefined : "coral")}
        empty={<EmptyState icon="file" title={t("没有匹配的开票资料")} desc={t("换个搜索词试试")} />}
      />
    </Page>
  );
}

/* ═══════════════════ 提成与绩效 ═══════════════════ */

/**
 * 提成阶梯。
 *
 * 按**利润率**分档而不是按销售额 —— 按额算，业务员会去接低毛利的大单冲量，
 * 公司做得越大越不赚钱。按率算，他们自己就会去谈价格和成本。
 */
const TIERS = [
  { min: -Infinity, max: 8, rate: 0, label: "8% 以下", labelEn: "Below 8%", tone: "coral" as const },
  { min: 8, max: 12, rate: 0.5, label: "8% – 12%", labelEn: "8% – 12%", tone: "amber" as const },
  { min: 12, max: 18, rate: 1.2, label: "12% – 18%", labelEn: "12% – 18%", tone: "accent" as const },
  { min: 18, max: 25, rate: 2.0, label: "18% – 25%", labelEn: "18% – 25%", tone: "jade" as const },
  { min: 25, max: Infinity, rate: 3.0, label: "25% 以上", labelEn: "25% and up", tone: "violet" as const },
];
const tierOf = (pct: number) => TIERS.find((x) => pct >= x.min && pct < x.max) ?? TIERS[0];

export function Commission() {
  const db = useDb();
  const { t, lang } = useT();
  const { user } = useAuth();

  const rows = useMemo(() => {
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const custById = new Map(db.customers.map((c) => [c.id, c]));
    const per = new Map<string, { sale: number; cost: number; orders: number }>();

    for (const c of db.costings) {
      const pi = piById.get(c.piId);
      if (!pi) continue;
      const cust = custById.get(pi.customerId);
      const owner = pi.salesId ?? cust?.salesId;
      if (!owner) continue;
      const fx = pi.currency === "CNY" ? 1 : pi.currency === "EUR" ? 7.9 : 6.7;
      const sale = centsToYuan(pi.amountCents) * fx;
      const cost =
        centsToYuan(c.purchaseCostCents + c.freightCents + c.customsCents + c.bankCents + c.otherCents);
      const cur = per.get(owner) ?? { sale: 0, cost: 0, orders: 0 };
      per.set(owner, { sale: cur.sale + sale, cost: cur.cost + cost, orders: cur.orders + 1 });
    }

    return db.users
      .filter((u) => u.role === "sales" && u.active)
      .map((u) => {
        const v = per.get(u.id) ?? { sale: 0, cost: 0, orders: 0 };
        const profit = v.sale - v.cost;
        const pct = v.sale > 0 ? (profit / v.sale) * 100 : 0;
        const tier = tierOf(pct);
        const next = TIERS[TIERS.indexOf(tier) + 1];
        /* 「再多赚多少能跳档」—— 这是整页最有用的一个数。
           告诉业务员差距有多远，比只给一个提成金额有说服力得多。 */
        const gap = next && v.sale > 0 ? Math.max(0, (next.min / 100) * v.sale - profit) : 0;
        return {
          id: u.id,
          name: personName(u, lang),
          hue: u.hue,
          team: u.team ?? "—",
          orders: v.orders,
          sale: v.sale,
          profit,
          pct,
          tier,
          nextTier: next ?? null,
          gap,
          commission: (profit * tier.rate) / 100,
          isMe: u.id === user?.id,
        };
      })
      .sort((a, b) => b.commission - a.commission);
  }, [db, lang, user]);

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const best = rows[0];

  return (
    <Page
      title={t("提成与绩效")}
      desc={t("按利润率阶梯计提。按率不按额 —— 按额算，冲量接来的低毛利单反而拿得多")}
      kpis={
        <>
          <Kpi icon="users" k={t("参与计提")} v={formatInt(rows.length)} s={t("在职业务员")} />
          <Kpi icon="wallet" k={t("提成合计")} v={formatCny(totalCommission)} s={t("按当前口径试算")} />
          <Kpi
            icon="target"
            k={t("平均利润率")}
            v={formatPct(rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0, 1)}
            s={t("加权前的简单平均")}
          />
          <Kpi icon="star" k={t("提成第一")} v={best?.name ?? "—"} s={best ? formatCny(best.commission) : "—"} tone="jade" />
        </>
      }
    >
      <Panel title={t("提成阶梯")} sub={t("落在哪一档，取决于该业务员全部订单的综合利润率")}>
        <div className="tiers">
          {TIERS.map((x) => {
            const who = rows.filter((r) => r.tier === x);
            return (
              <div key={x.label} className="tier" data-tone={x.tone}>
                <b>{lang === "en" ? x.labelEn : x.label}</b>
                <span className="tier-rate num">{x.rate ? `${x.rate}%` : t("不计提")}</span>
                <div className="tier-who">
                  {who.length ? (
                    who.map((r) => (
                      <span key={r.id} className="tier-chip">
                        <Avatar name={r.name} hue={r.hue} size="sm" />
                        {r.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={t("按人试算")} sub={t("利润 = 签约额 − 采购成本 − 期间费用")}>
        <table className="mini-table">
          <thead>
            <tr>
              <th>{t("业务员")}</th>
              <th>{t("小组")}</th>
              <th className="r">{t("订单数")}</th>
              <th className="r">{t("签约额")}</th>
              <th className="r">{t("利润")}</th>
              <th className="r">{t("利润率")}</th>
              <th>{t("档位")}</th>
              <th className="r">{t("提成")}</th>
              <th>{t("距离下一档")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-me={r.isMe ? "1" : undefined}>
                <td>
                  <span className="tier-chip">
                    <Avatar name={r.name} hue={r.hue} size="sm" />
                    <b>{r.name}</b>
                    {r.isMe ? <Pill tone="accent">{t("我")}</Pill> : null}
                  </span>
                </td>
                <td className="muted">{r.team}</td>
                <td className="r num">{formatInt(r.orders)}</td>
                <td className="r num">{formatCny(r.sale)}</td>
                <td className="r num">{formatCny(r.profit)}</td>
                <td className="r num">
                  <span style={{ color: `var(--${r.tier.tone})` }}>{formatPct(r.pct, 1)}</span>
                </td>
                <td>
                  <Pill tone={r.tier.tone}>{lang === "en" ? r.tier.labelEn : r.tier.label}</Pill>
                </td>
                <td className="r num strong">{r.commission ? formatCny(r.commission) : "—"}</td>
                <td className="muted">
                  {r.nextTier
                    ? r.gap > 0
                      ? t("再多 {v} 利润跳到 {r}", {
                          v: formatCny(r.gap),
                          r: `${r.nextTier.rate}%`,
                        })
                      : t("已够格")
                    : t("已是最高档")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="panel-note">
          {t("演示口径：利润率按该业务员全部订单合计计算，不区分已完结与在跟。正式使用应按月封账。")}
        </p>
      </Panel>
    </Page>
  );
}

/* ═══════════════════ 报表中心 ═══════════════════ */

type ReportDef = {
  icon: IconName;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  to: string;
  tone: string;
  /** 这张报表现在有多少行，直接算出来 —— 空报表就别让人点进去了 */
  count: (db: ReturnType<typeof useDb>) => number;
};

const REPORTS: ReportDef[] = [
  {
    icon: "gauge", tone: "accent",
    title: "订单利润率明细", titleEn: "Order margin detail",
    desc: "每张 PI 的成本构成与利润率，负毛利的排在最前面",
    descEn: "Cost breakdown and margin per PI, worst first",
    to: "/orders?sort=profit", count: (db) => db.costings.length,
  },
  {
    icon: "alert", tone: "coral",
    title: "停滞与超期批次", titleEn: "Stalled shipments",
    desc: "超过 7 天没有新动态，或里程碑已过计划日",
    descEn: "No update in 7 days, or milestone past plan",
    to: "/follow-ups?view=risk", count: (db) => db.shipments.filter((s) => !s.archived && s.hasTodo).length,
  },
  {
    icon: "file", tone: "violet",
    title: "退税发票台账", titleEn: "VAT refund ledger",
    desc: "按开票主体分账，未关联订单的行会标红",
    descEn: "By seller entity; unlinked rows flagged",
    to: "/tax-refund", count: (db) => db.taxInvoices.length,
  },
  {
    icon: "pie", tone: "amber",
    title: "费用明细穿透", titleEn: "Expense drill-down",
    desc: "按订单看海运 / 报关 / 银行费用，按费用率排序",
    descEn: "Freight, customs and bank cost by order",
    to: "/expenses", count: (db) => db.costings.length,
  },
  {
    icon: "wallet", tone: "jade",
    title: "收付款流水", titleEn: "Payments ledger",
    desc: "收汇与付汇明细，含待认领的那几笔",
    descEn: "Receipts and payments, including unclaimed",
    to: "/payments", count: (db) => db.ops.payments.length,
  },
  {
    icon: "shield", tone: "coral",
    title: "中信保额度占用", titleEn: "Credit insurance usage",
    desc: "限额、已占用与在跟订单额的对比",
    descEn: "Limit vs used vs open exposure",
    to: "/sinosure", count: (db) => db.customers.filter((c) => c.sinosureLimitCents > 0).length,
  },
  {
    icon: "box", tone: "accent",
    title: "库存与临期", titleEn: "Inventory and expiry",
    desc: "可用量、锁库归属，半年内到期的批次",
    descEn: "Available qty, PI locks, expiring lots",
    to: "/stock?view=expiring", count: (db) => db.ops.stock.length,
  },
  {
    icon: "cart", tone: "violet",
    title: "采购合同执行", titleEn: "Purchase contract status",
    desc: "已签金额、已付比例与交期",
    descEn: "Signed, paid ratio and delivery dates",
    to: "/purchase-contract", count: (db) => db.ops.contracts.length,
  },
  {
    icon: "target", tone: "jade",
    title: "业务员提成试算", titleEn: "Commission calculation",
    desc: "按利润率阶梯计提，含距离下一档的差距",
    descEn: "Tiered by margin, with gap to next tier",
    to: "/commission", count: (db) => db.users.filter((u) => u.role === "sales" && u.active).length,
  },
];

export function Reports() {
  const db = useDb();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const q = get("q").trim().toLowerCase();

  const list = REPORTS.map((r) => ({ ...r, n: r.count(db) })).filter(
    (r) => !q || `${r.title} ${r.titleEn} ${r.desc}`.toLowerCase().includes(q),
  );

  return (
    <Page
      title={t("报表中心")}
      desc={t("常用报表的集中出口。每张都是活的视图，点进去可以继续筛选、再导出 Excel")}
      kpis={
        <>
          <Kpi icon="chart" k={t("预置报表")} v={formatInt(REPORTS.length)} s={t("覆盖订单 / 资金 / 库存")} />
          <Kpi icon="download" k={t("可导出")} v={formatInt(REPORTS.length)} s={t("全部支持 Excel")} />
          <Kpi icon="database" k={t("数据行数")} v={formatInt(REPORTS.reduce((s, r) => s + r.count(db), 0))} s={t("当前账套合计")} />
          <Kpi icon="clock" k={t("数据时点")} v={todayIso().slice(5)} s={t("演示数据随今天滚动")} />
        </>
      }
      toolbar={<SearchInput value={get("q")} onChange={(v) => set({ q: v })} placeholder={t("搜报表名称…")} />}
    >
      <div className="report-grid">
        {list.map((r) => (
          <Link key={r.to} className="report" to={r.to} data-tone={r.tone}>
            <span className="report-i">
              <Icon name={r.icon} />
            </span>
            <span className="report-t">
              <b>{lang === "en" ? r.titleEn : r.title}</b>
              <small>{lang === "en" ? r.descEn : r.desc}</small>
            </span>
            <span className="report-n num">{formatInt(r.n)}</span>
            <Icon name="arrowRight" size={15} className="report-go" />
          </Link>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon="chart" title={t("没有匹配的报表")} desc={t("换个搜索词试试")} /> : null}
    </Page>
  );
}

/* ═══════════════════ 登录记录 ═══════════════════ */

export function Logins() {
  const db = useDb();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const view = get("view");

  const rows = useMemo(() => {
    const userById = new Map(db.users.map((u) => [u.id, u]));
    const key = q.trim().toLowerCase();
    return db.ops.logins
      .map((l) => {
        const u = userById.get(l.userId);
        return {
          id: l.id,
          name: personName(u, lang),
          username: u?.username ?? "—",
          hue: u?.hue ?? 0,
          at: l.at,
          date: l.at.slice(0, 10),
          time: l.at.slice(11, 16),
          ip: l.ip,
          device: l.device,
          method: l.method,
          ok: l.ok,
          risk: l.risk,
        };
      })
      .filter((r) => (view === "risk" ? !!r.risk : true))
      .filter((r) => !key || `${r.name} ${r.username} ${r.ip} ${r.device}`.toLowerCase().includes(key));
  }, [db, q, view, lang]);

  const risky = rows.filter((r) => r.risk);
  const failed = rows.filter((r) => !r.ok);

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "who",
        title: t("账号"),
        width: 200,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.name.localeCompare(b.name),
        render: (r) => (
          <span className="tier-chip">
            <Avatar name={r.name} hue={r.hue} size="sm" />
            <span className="truncate">
              <div className="cell-main">{r.name}</div>
              <div className="cell-sub num">{r.username}</div>
            </span>
          </span>
        ),
      },
      {
        key: "at",
        title: t("登录时间"),
        width: 170,
        sort: (a, b) => a.at.localeCompare(b.at),
        render: (r) => (
          <>
            <div className="num">
              {r.date} {r.time}
            </div>
            <div className="cell-sub">{relativeTime(r.at)}</div>
          </>
        ),
      },
      { key: "ip", title: "IP", width: 150, render: (r) => <span className="num">{r.ip}</span> },
      { key: "device", title: t("设备"), width: 200, render: (r) => <span className="muted truncate">{r.device}</span> },
      {
        key: "method",
        title: t("方式"),
        width: 110,
        render: (r) => (
          <Pill tone={r.method === "google" ? "violet" : "mute"}>
            {r.method === "google" ? "Google" : r.method === "demo" ? t("演示身份") : t("账号口令")}
          </Pill>
        ),
      },
      {
        key: "result",
        title: t("结果"),
        width: 100,
        render: (r) => <Pill tone={r.ok ? "jade" : "coral"}>{r.ok ? t("成功") : t("失败")}</Pill>,
      },
      {
        key: "risk",
        title: t("风险提示"),
        width: 280,
        render: (r) => (r.risk ? <span style={{ color: "var(--coral)" }}>{r.risk}</span> : <span className="muted">—</span>),
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("登录记录")}
      desc={t("登录时间、IP 与设备。非常用地和凌晨时段会标出来，异常登录第一时间看得见")}
      kpis={
        <>
          <Kpi icon="key" k={t("登录次数")} v={formatInt(rows.length)} s={t("最近两周")} />
          <Kpi icon="users" k={t("活跃账号")} v={formatInt(new Set(rows.map((r) => r.username)).size)} s={t("有登录记录的")} />
          <Kpi icon="lock" k={t("登录失败")} v={formatInt(failed.length)} s={t("口令错误等")} tone={failed.length ? "amber" : "jade"} />
          <Kpi
            icon="shield"
            k={t("异常登录")}
            v={formatInt(risky.length)}
            s={t("非常用地 / 异常时段")}
            tone={risky.length ? "coral" : "jade"}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜账号 / IP / 设备…")} />
          <Segmented
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "risk", label: t("仅异常"), count: risky.length },
            ]}
          />
        </>
      }
    >
      {risky.length ? (
        <Panel title={t("需要核实的登录")} sub={t("确认不是本人操作就应立即改口令")}>
          <BarList
            data={risky.map((r) => ({ name: `${r.name} · ${r.ip}`, value: 1, tone: "coral" }))}
            format={() => ""}
          />
          <p className="panel-note">{risky.map((r) => `${r.date} ${r.time} — ${r.risk}`).join("；")}</p>
        </Panel>
      ) : null}
      <DataGrid
        gridId="logins"
        rows={rows}
        columns={columns}
        getRowLabel={(r) => `${r.name} ${r.at}`}
        rowTone={(r) => (r.risk ? "coral" : r.ok ? undefined : "amber")}
        empty={<EmptyState icon="key" title={t("没有匹配的登录记录")} desc={t("换个筛选条件试试")} />}
      />
    </Page>
  );
}

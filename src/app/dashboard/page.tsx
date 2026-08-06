import Link from "next/link";
import { dashboardData } from "@/server/dashboard";
import { TrendChart, ProfitDistribution } from "@/components/dashboard/charts";
import { formatMoney, formatCny, formatInt } from "@/lib/format";
import { PROFIT_WARN_PCT } from "@/lib/order-rules";

export const metadata = { title: "数据看板 · MT 通商" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const d = await dashboardData();
  const countryMax = Math.max(1, ...d.countries.map((c) => c.value));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>数据看板</h1>
          <p>
            {d.kpi.year} 年度 · 全部公司段 · 数据截至 {d.asOf}
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi" data-tone="accent">
          <span className="k">在跟订单额 USD</span>
          <span className="v num">{formatMoney(d.kpi.totalUsd).replace(/\.00$/, "")}</span>
          <span className="f">RMB 单按自定汇率折算并入</span>
        </div>
        <div className="kpi">
          <span className="k">本月出运柜量</span>
          <span className="v num">{formatInt(d.kpi.shippedThisMonth)}</span>
          <span className="f">按 ATD 实际开船日统计</span>
        </div>
        <div className="kpi" data-tone="amber">
          <span className="k">利润率预警订单</span>
          <span className="v num">{formatInt(d.kpi.warn)}</span>
          <span className="f">
            其中 <b style={{ color: "var(--coral)" }}>{d.kpi.loss}</b> 单为负毛利
          </span>
        </div>
        <div className="kpi" data-tone={d.kpi.troubled ? "coral" : "jade"}>
          <span className="k">停滞 / 超期批次</span>
          <span className="v num">{formatInt(d.kpi.troubled)}</span>
          <span className="f">
            {d.kpi.stalledMax ? (
              <>
                最长停滞 <span className="num">{d.kpi.stalledMax}</span> 天
              </>
            ) : (
              "全部正常推进"
            )}
          </span>
        </div>
        <div className="kpi" data-tone="jade">
          <span className="k">本年实退税</span>
          <span className="v num">{formatCny(d.kpi.yearTax)}</span>
          <span className="f">{d.kpi.year} 年度累计</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-h">
            <h3>月度出运与订单额</h3>
            <span className="sub">柱 = 出运柜量 · 线 = 签约订单额</span>
          </div>
          <div className="card-b">
            <TrendChart data={d.monthly} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>今天要处理什么</h3>
            <span style={{ marginLeft: "auto" }}>
              <span className={`pill ${d.risks.length ? "coral" : "jade"}`}>{d.risks.length} 项</span>
            </span>
          </div>
          <div className="card-b" style={{ paddingTop: 4 }}>
            {d.risks.length === 0 ? (
              <p style={{ color: "var(--text-3)", padding: "20px 0", textAlign: "center" }}>
                没有需要立刻处理的异常。
              </p>
            ) : (
              d.risks.map((r) => (
                <div className="risk" key={r.title}>
                  <div
                    className="ico"
                    style={{ background: `var(--${r.tone}-soft)`, color: `var(--${r.tone})` }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 17h.01" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{r.title}</b>
                    <span>{r.detail}</span>
                  </div>
                  <Link className="btn btn-sm" href={r.href}>
                    去处理
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-h">
            <h3>目的国 TOP {d.countries.length}</h3>
            <span className="sub">按在跟订单额</span>
          </div>
          <div className="card-b">
            <div className="bars">
              {d.countries.map((c) => (
                <div className="bar-row" key={c.name}>
                  <span>{c.name}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${((c.value / countryMax) * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="num" style={{ textAlign: "right", color: "var(--text-2)" }}>
                    {(c.value / 10000).toFixed(1)}万
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>业务员业绩</h3>
            <span className="sub">在跟订单额 / 平均利润率</span>
          </div>
          <div className="card-b" style={{ paddingTop: 6 }}>
            {d.leaderboard.map((l, i) => (
              <div className="lead-row" key={l.name}>
                <span className="rank">{i + 1}</span>
                <span
                  className="avatar"
                  style={{
                    width: 26,
                    height: 26,
                    flex: "0 0 26px",
                    fontSize: 11,
                    background: "var(--accent-soft)",
                    color: "var(--accent-ink)",
                  }}
                >
                  {l.name.slice(0, 1)}
                </span>
                <span style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{l.name}</b>
                </span>
                <span className="num" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  {formatMoney(l.amount).replace(/\.00$/, "")}
                </span>
                <span
                  className={`pill plain num ${l.rate < 0 ? "coral" : l.rate < PROFIT_WARN_PCT ? "amber" : "jade"}`}
                  style={{ minWidth: 56, justifyContent: "center" }}
                >
                  {l.rate.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>订单利润率分布</h3>
            <span className="sub">共 {d.buckets.reduce((s, b) => s + b.count, 0)} 单</span>
          </div>
          <div className="card-b">
            <ProfitDistribution data={d.buckets} />
          </div>
        </div>
      </div>
    </>
  );
}

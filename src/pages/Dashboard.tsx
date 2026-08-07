import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { BarList, MonthlyChart, Sparkline } from "@/components/charts";
import { MilestoneRail } from "@/components/MilestoneRail";
import { EmptyState, Pill } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { dashboardData } from "@/data/queries";
import { formatCompact, formatPct, humanDate } from "@/lib/format";
import { PROFIT_WARN_PCT } from "@/lib/rules";

export default function Dashboard() {
  const db = useDb();
  const { viewer, displayName } = useAuth();
  const d = useMemo(() => dashboardData(db, viewer), [db, viewer]);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? "还没睡" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {greeting}，{displayName}
          </h1>
          <p>
            截至 {d.asOf} · 数据范围内 {d.kpi.orders} 张在跟订单
            {d.risks.length ? ` · ${d.risks.length} 件事等你处理` : " · 今天没有需要处理的异常"}
          </p>
        </div>
      </div>

      <div className="kpis">
        <Kpi
          icon="wallet"
          k="在跟订单额"
          v={formatCompact(d.kpi.totalUsd)}
          s={`${d.kpi.orders} 张订单 · 人民币单按自定汇率折算`}
          spark={d.monthly.map((m) => m.amount)}
        />
        <Kpi icon="ship" k="本月出运" v={String(d.kpi.shippedThisMonth)} s={`在途 ${d.kpi.inTransit} 票`} spark={d.monthly.map((m) => m.count)} />
        <Kpi
          icon="alert"
          k="停滞 / 超期"
          v={String(d.kpi.troubled)}
          s={d.kpi.stalledMax ? `最久一票停滞 ${d.kpi.stalledMax} 天` : "没有停滞的批次"}
          tone={d.kpi.troubled ? "coral" : undefined}
          to="/follow-ups?risk=1"
        />
        <Kpi
          icon="gauge"
          k="利润率预警"
          v={String(d.kpi.warn)}
          s={d.kpi.loss ? `其中 ${d.kpi.loss} 单为负毛利` : `低于 ${PROFIT_WARN_PCT}% 的订单`}
          tone={d.kpi.loss ? "coral" : d.kpi.warn ? "amber" : undefined}
          to="/orders?risk=1"
        />
        <Kpi icon="file" k={`${d.kpi.year} 年退税`} v={formatCompact(d.kpi.yearTax, "¥")} s="已开票口径累计" to="/tax-refund" />
        <Kpi icon="target" k="平均利润率" v={formatPct(d.kpi.avgRate, 1)} s="数据范围内所有在跟订单" tone={d.kpi.avgRate < PROFIT_WARN_PCT ? "amber" : "jade"} />
      </div>

      <div className="dash">
        <div className="dash-2">
          <section className="card">
            <div className="card-head">
              <h3>今天要处理什么</h3>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>每条都能点进去处理</span>
            </div>
            {d.risks.length === 0 ? (
              <EmptyState icon="check" title="没有需要处理的异常" desc="停滞、超期、负毛利、退税未关联、额度超限，现在都是干净的。" />
            ) : (
              <div>
                {d.risks.map((r) => (
                  <Link className="risk" data-tone={r.tone} to={r.href} key={r.title}>
                    <span className="risk-ico">
                      <Icon name={r.tone === "coral" ? "alert" : r.tone === "amber" ? "info" : "flag"} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{r.title}</b>
                      <small>{r.detail}</small>
                    </span>
                    <span className="go">
                      {r.action}
                      <Icon name="chevronRight" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>接下来十天的节点</h3>
            </div>
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 6 }}>
              {d.upcoming.length === 0 ? (
                <EmptyState icon="calendar" title="近十天没有计划节点" desc="所有批次的下一个节点都不在这个窗口里。" />
              ) : (
                <div className="timeline">
                  {d.upcoming.map((s) => (
                    <Link className="tl-row" to={`/follow-ups?id=${s.id}`} key={s.id} data-late={s.hasLate ? "1" : "0"}>
                      <span className="tl-when">{humanDate(s.nextDate)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="batch-cell">
                          <b className="cell-main">{s.batchNo}</b>
                          {s.batchLabel ? <span className="badge-batch">{s.batchLabel}</span> : null}
                        </span>
                        <span className="cell-sub">
                          <span>
                            {s.country} · {s.customerName ?? "—"}
                          </span>
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h3>月度出运与签约额</h3>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>近 8 个月</span>
          </div>
          <div className="card-body">
            <MonthlyChart data={d.monthly} />
          </div>
        </section>

        <div className="dash-3">
          <section className="card">
            <div className="card-head">
              <h3>目的国 TOP</h3>
            </div>
            <div className="card-body">
              <BarList data={d.countries.map((c) => ({ name: c.name, value: c.value }))} format={(v) => formatCompact(v)} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>业务员业绩</h3>
            </div>
            <div className="card-body">
              <div className="rank">
                {d.leaderboard.slice(0, 6).map((l) => (
                  <div className="rank-row" key={l.name}>
                    <span className="rank-name">
                      <span className="truncate">{l.name}</span>
                      <Pill tone={l.rate < PROFIT_WARN_PCT ? "amber" : "jade"} dot={false}>
                        {formatPct(l.rate, 1)}
                      </Pill>
                    </span>
                    <span className="rank-val">{formatCompact(l.amount)}</span>
                    <div className="bar">
                      <i style={{ width: `${(l.amount / (d.leaderboard[0]?.amount || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>利润率分布</h3>
            </div>
            <div className="card-body">
              <BarList data={d.buckets.map((b) => ({ name: b.label, value: b.count, tone: b.tone }))} format={(v) => `${v} 单`} />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h3>在途批次一览</h3>
            <span className="spacer" />
            <Link to="/follow-ups" className="btn btn-sm">
              打开跟单表
              <Icon name="chevronRight" />
            </Link>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            {d.upcoming.slice(0, 4).map((s) => (
              <div key={s.id} style={{ display: "grid", gap: 6 }}>
                <div className="row">
                  <span className="batch-cell">
                    <b className="cell-main">{s.batchNo}</b>
                    {s.batchLabel ? <span className="badge-batch">{s.batchLabel}</span> : null}
                  </span>
                  <span className="cell-sub" style={{ margin: 0 }}>
                    {s.country} · {s.carrier ?? "待订舱"}
                  </span>
                  <span className="spacer" />
                  <span className="muted truncate" style={{ fontSize: "var(--fs-sm)", maxWidth: 300 }}>
                    {s.latestNote ?? "还没有动态"}
                  </span>
                </div>
                <MilestoneRail milestones={s.milestones} />
              </div>
            ))}
            {d.upcoming.length === 0 ? <p className="muted">近期没有在途批次。</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  k,
  v,
  s,
  tone,
  spark,
  to,
}: {
  icon: IconName;
  k: string;
  v: string;
  s: string;
  tone?: string;
  spark?: number[];
  to?: string;
}) {
  const body = (
    <>
      <span className="kpi-k">
        <Icon name={icon} />
        {k}
      </span>
      <span className="kpi-v">{v}</span>
      <span className="kpi-s">{s}</span>
      {spark ? <Sparkline values={spark} tone={tone ?? "accent"} /> : null}
    </>
  );
  return to ? (
    <Link className="kpi" data-tone={tone} to={to}>
      {body}
    </Link>
  ) : (
    <div className="kpi" data-tone={tone}>
      {body}
    </div>
  );
}

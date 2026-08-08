import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { BarList, MonthlyChart, Sparkline } from "@/components/charts";
import { MilestoneRail } from "@/components/MilestoneRail";
import { EmptyState, Pill } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { dashboardData } from "@/data/queries";
import { formatCompact, formatPct, humanDate } from "@/lib/format";
import { PROFIT_WARN_PCT } from "@/lib/rules";
import { RoleBand } from "@/components/RoleBand";
import { SetupGuide } from "@/components/SetupGuide";

export default function Dashboard() {
  const { t } = useT();
  const db = useDb();
  const { viewer } = useAuth();
  const d = useMemo(() => dashboardData(db, viewer), [db, viewer]);

  return (
    <div className="page">
      {/* 空账套引导排在最前面：账套还没搭起来的时候，
          下面那些"0 张在跟订单""今天没有异常"全是假的从容 */}
      <SetupGuide />

      {/* 角色条：只属于你的行动清单。下面的经营大盘所有角色一样 */}
      <RoleBand />

      <div className="page-head">
        <div>
          <h1>{t("经营大盘")}</h1>
          <p>
            {t("截至 {d} · 数据范围内 {n} 张在跟订单", { d: d.asOf, n: d.kpi.orders })}
            {d.risks.length ? t(" · {n} 件事等你处理", { n: d.risks.length }) : t(" · 今天没有需要处理的异常")}
          </p>
        </div>
      </div>

      <div className="kpis">
        <Kpi
          icon="wallet"
          k={t("在跟订单额")}
          v={formatCompact(d.kpi.totalUsd)}
          s={t("{n} 张订单 · 人民币单按自定汇率折算", { n: d.kpi.orders })}
          spark={d.monthly.map((m) => m.amount)}
        />
        <Kpi icon="ship" k={t("本月出运")} v={String(d.kpi.shippedThisMonth)} s={t("在途 {n} 票", { n: d.kpi.inTransit })} spark={d.monthly.map((m) => m.count)} />
        <Kpi
          icon="alert"
          k={t("停滞 / 超期")}
          v={String(d.kpi.troubled)}
          s={d.kpi.stalledMax ? t("最久一票停滞 {n} 天", { n: d.kpi.stalledMax }) : t("没有停滞的批次")}
          tone={d.kpi.troubled ? "coral" : undefined}
          to="/follow-ups?risk=1"
        />
        <Kpi
          icon="gauge"
          k={t("利润率预警")}
          v={String(d.kpi.warn)}
          s={d.kpi.loss ? t("其中 {n} 单为负毛利", { n: d.kpi.loss }) : t("低于 {p}% 的订单", { p: PROFIT_WARN_PCT })}
          tone={d.kpi.loss ? "coral" : d.kpi.warn ? "amber" : undefined}
          to="/orders?risk=1"
        />
        <Kpi icon="file" k={t("{y} 年退税", { y: d.kpi.year })} v={formatCompact(d.kpi.yearTax, "¥")} s={t("已开票口径累计")} to="/tax-refund" />
        <Kpi icon="target" k={t("平均利润率")} v={formatPct(d.kpi.avgRate, 1)} s={t("数据范围内所有在跟订单")} tone={d.kpi.avgRate < PROFIT_WARN_PCT ? "amber" : "jade"} />
      </div>

      <div className="dash">
        <div className="dash-2">
          <section className="card">
            <div className="card-head">
              <h3>{t("今天要处理什么")}</h3>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{t("每条都能点进去处理")}</span>
            </div>
            {d.risks.length === 0 ? (
              <EmptyState icon="check" title={t("没有需要处理的异常")} desc={t("停滞、超期、负毛利、退税未关联、额度超限，现在都是干净的。")} />
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
              <h3>{t("接下来十天的节点")}</h3>
            </div>
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 6 }}>
              {d.upcoming.length === 0 ? (
                <EmptyState icon="calendar" title={t("近十天没有计划节点")} desc={t("所有批次的下一个节点都不在这个窗口里。")} />
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
            <h3>{t("月度出运与签约额")}</h3>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{t("近 8 个月")}</span>
          </div>
          <div className="card-body">
            <MonthlyChart data={d.monthly} />
          </div>
        </section>

        <div className="dash-3">
          <section className="card">
            <div className="card-head">
              <h3>{t("目的国 TOP")}</h3>
            </div>
            <div className="card-body">
              <BarList data={d.countries.map((c) => ({ name: c.name, value: c.value }))} format={(v) => formatCompact(v)} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>{t("业务员业绩")}</h3>
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
              <h3>{t("利润率分布")}</h3>
            </div>
            <div className="card-body">
              <BarList data={d.buckets.map((b) => ({ name: b.label, value: b.count, tone: b.tone }))} format={(v) => t("{n} 单", { n: v })} />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h3>{t("在途批次一览")}</h3>
            <span className="spacer" />
            <Link to="/follow-ups" className="btn btn-sm">
              {t("打开跟单表")}
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
                    {s.country} · {s.carrier ?? t("待订舱")}
                  </span>
                  <span className="spacer" />
                  <span className="muted truncate" style={{ fontSize: "var(--fs-sm)", maxWidth: 300 }}>
                    {s.latestNote ?? t("还没有动态")}
                  </span>
                </div>
                <MilestoneRail milestones={s.milestones} />
              </div>
            ))}
            {d.upcoming.length === 0 ? <p className="muted">{t("近期没有在途批次。")}</p> : null}
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

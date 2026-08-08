/**
 * 应收账龄。
 *
 * ── 老板周一早上要看的就是这张表 ──
 * 系统里原本有收付款、有核销、有资金池，唯独没有"谁欠我多少、欠了多久"。
 * 那三样回答的是"钱来了没有"，这一张回答的是"钱该来了没来"。
 *
 * ── 起算日是提单日，不是签约日 ──
 * "见提单副本 30 天"是外贸的标准付款条件，账期从**实际发货**起算。
 * 按签约日算，一张 3 月签 6 月出货的单子会凭空多出三个月逾期，
 * 催收清单第一屏全是假警报，真正该催的反而排在后面。
 *
 * ── 加权平均逾期天数，不是平均 ──
 * 十张小单逾期 5 天和一张大单逾期 90 天，按单数平均出来差不多，
 * 按金额加权才看得出后者才是要命的那个。
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Page, Kpi, Panel, useParam } from "@/components/ui/PageKit";
import { Bar, EmptyState, Pill, SearchInput } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listSalesNames, viewerOf } from "@/data/queries";
import { AGING_BUCKETS, agingByCustomer, agingSummary, listAging, type AgingRow } from "@/data/flow-queries";
import { centsToYuan, formatCompact, formatMoney, shortDate } from "@/lib/format";
import { CC_BY_COUNTRY } from "@/lib/geo";
import { exportXlsx, stampName } from "@/lib/xlsx";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥" };
const symOf = (c: string) => SYM[c] ?? `${c} `;

const bucketTone = (b: string) => (b === "待触发" ? "mute" : b === "未到期" ? "accent" : b === "逾期 1–30 天" ? "accent" : b === "逾期 31–60 天" ? "amber" : "coral");

/**
 * 催收话术。
 *
 * 不是客套模板，是按逾期档位分的三种真实做法：
 * 刚过期先给台阶（可能只是财务排期），一个月往上要拿住货权，
 * 三个月往上就该走中信保报损了 —— 报损是有时限的，错过就赔不到。
 */
const SCRIPT: Record<string, string> = {
  "未到期": "还没到期。到期前 3 天发一封对账单过去，比到期后催有用得多。",
  "逾期 1–30 天": "先给台阶：发对账单确认金额无误，问是不是财务排期问题。这个阶段多数是流程问题，不是意愿问题。",
  "逾期 31–60 天": "拿住货权：后续订单暂停排产，未放行的批次先不放单。同时让业务员当面（视频）谈一次，只发邮件此时已经没用。",
  "逾期 61–90 天": "升级处理：由老板出面，给明确的最后期限。同时核对中信保保单，确认报损时限还剩多久。",
  "逾期 90 天以上": "走中信保报损流程 —— 报损是有时限的，拖过去就赔不到了。同时评估是否停止一切合作。",
};

export default function ReceivablesPage() {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const { get, set } = useParam();
  const viewer = viewerOf(user);
  const q = get("q");
  const bucket = get("bucket");
  const sales = get("sales");

  const all = useMemo(() => listAging(db, viewer), [db, viewer]);
  const rows = useMemo(() => listAging(db, viewer, { q, bucket, sales }), [db, viewer, q, bucket, sales]);
  const sum = useMemo(() => agingSummary(all), [all]);
  const byCus = useMemo(() => agingByCustomer(all.filter((r) => r.overdue > 0)), [all]);
  const [pick, setPick] = useState<string | null>(null);

  const columns: Column<AgingRow>[] = useMemo(
    () => [
      {
        key: "pi",
        title: t("PI / 客户"),
        width: 240,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.piNo.localeCompare(b.piNo),
        render: (r) => (
          <>
            <div className="truncate strong">
              <Flag cc={CC_BY_COUNTRY[r.country]} />
              {r.customer}
            </div>
            <div className="cell-sub">
              <span className="num">{r.piNo}</span>
              {/* 一张 PI 现在会拆成好几行，不标期次根本分不清哪行是哪笔钱 */}
              {r.termLabel ? <span className="cell-term">{t("第 {n} 期", { n: r.termLabel })}</span> : null}
              <span>·</span>
              <Pill tone={r.creditLevel === "A" ? "jade" : r.creditLevel === "B" ? "accent" : "amber"} dot={false}>
                {r.creditLevel}
              </Pill>
              <span>·</span>
              <span>{r.salesName}</span>
            </div>
          </>
        ),
      },
      {
        key: "amount",
        title: t("合同额"),
        width: 118,
        align: "right",
        sort: (a, b) => a.amountCents - b.amountCents,
        render: (r) => <span className="cell-num">{formatMoney(centsToYuan(r.amountCents), symOf(r.currency))}</span>,
      },
      {
        key: "paid",
        title: t("已收"),
        width: 140,
        align: "right",
        sort: (a, b) => a.paidCents / a.amountCents - b.paidCents / b.amountCents,
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <span className="cell-num">{formatMoney(centsToYuan(r.paidCents), symOf(r.currency))}</span>
            <div style={{ width: 70 }}>
              <Bar value={r.paidCents} max={r.amountCents} tone={r.paidCents > 0 ? "jade" : ""} />
            </div>
          </div>
        ),
      },
      {
        key: "open",
        title: t("未收"),
        width: 126,
        align: "right",
        sort: (a, b) => a.openCents - b.openCents,
        render: (r) => <span className="cell-num strong" style={{ color: r.overdue > 0 ? "var(--coral)" : undefined }}>{formatMoney(centsToYuan(r.openCents), symOf(r.currency))}</span>,
      },
      {
        key: "start",
        title: t("起算 / 账期"),
        width: 150,
        tip: t("按收款计划的触发事件起算。事件还没发生就没有起算日 —— 这里不会编一个"),
        render: (r) => (
          <>
            <div className="num">{r.startOn ? shortDate(r.startOn) : <span className="muted">{r.pending ? t(r.pending) : "—"}</span>}</div>
            <div className="cell-sub">
              {/* 起算说明写事件名，不是「款到发货」——
                  定金那一期 offsetDays 是 0，照旧文案会全都显示成「款到发货」 */}
              <span>
                {r.triggerLabel
                  ? r.termDays
                    ? t("{ev} {n} 天", { ev: t(r.triggerLabel), n: r.termDays })
                    : t(r.triggerLabel)
                  : r.termDays
                    ? t("账期 {n} 天", { n: r.termDays })
                    : t("款到发货")}
              </span>
              {r.blocksRelease ? <span className="cell-flag">{t("不收不放单")}</span> : null}
            </div>
          </>
        ),
      },
      {
        key: "due",
        title: t("到期日"),
        width: 112,
        // 没有到期日的排最后：它们不是"最早到期"，是"还不知道什么时候到期"
        sort: (a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
        render: (r) =>
          r.dueOn ? <span className="num">{shortDate(r.dueOn)}</span> : <span className="muted">{t("待定")}</span>,
      },
      {
        key: "overdue",
        title: t("逾期"),
        width: 150,
        align: "right",
        sort: (a, b) => a.overdue - b.overdue,
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <Pill tone={bucketTone(r.bucket)} dot={false}>
              {r.bucket === "待触发" ? t(r.pending ?? "待触发") : r.overdue > 0 ? t("{n} 天", { n: r.overdue }) : t("未到期")}
            </Pill>
            <span className="cell-sub">{t(r.bucket)}</span>
          </div>
        ),
      },
    ],
    [t],
  );

  /* 挂在表格工具条上（DataGrid 的 onExport），不放页头 ——
     全屏看表时页头是不在的，而那正是最想「这批直接导出去」的时候。
     金额、日期写成 Excel 原生格式，所以不能走通用导出（它只能拿到界面上那串文本）。 */
  const doExport = () =>
    exportXlsx(
      stampName("应收账龄"),
      [
        { header: t("PI 号"), value: (r: AgingRow) => r.piNo, width: 16 },
        { header: t("期次"), value: (r: AgingRow) => r.termLabel ?? t("整单"), width: 8 },
        { header: t("状态"), value: (r: AgingRow) => (r.pending ? t(r.pending) : ""), width: 12 },
        { header: t("客户"), value: (r: AgingRow) => r.customer, width: 24 },
        { header: t("国家"), value: (r: AgingRow) => r.country, width: 12 },
        { header: t("业务员"), value: (r: AgingRow) => r.salesName, width: 12 },
        { header: t("币种"), value: (r: AgingRow) => r.currency, width: 8 },
        { header: t("合同额"), type: "number", value: (r: AgingRow) => centsToYuan(r.amountCents), width: 14 },
        { header: t("已收"), type: "number", value: (r: AgingRow) => centsToYuan(r.paidCents), width: 14 },
        { header: t("未收"), type: "number", value: (r: AgingRow) => centsToYuan(r.openCents), width: 14 },
        { header: t("起算日"), type: "date", value: (r: AgingRow) => r.startOn, width: 12 },
        { header: t("到期日"), type: "date", value: (r: AgingRow) => r.dueOn, width: 12 },
        { header: t("逾期天数"), type: "number", format: "0", value: (r: AgingRow) => r.overdue, width: 10 },
        { header: t("账龄"), value: (r: AgingRow) => r.bucket, width: 14 },
      ],
      rows,
    );

  return (
    <Page
      title={t("应收账龄")}
      desc={t("谁欠我多少、欠了多久 · 账期从提单日起算，按金额加权算平均逾期")}
      kpis={
        <>
          <Kpi icon="wallet" k={t("应收合计")} v={formatCompact(centsToYuan(sum.total), "$")} s={t("{n} 张单未收清", { n: all.length })} />
          <Kpi icon="alert" k={t("已逾期")} v={formatCompact(centsToYuan(sum.overdueCents), "$")} s={t("{n} 张单过了到期日", { n: sum.overdueCount })} tone={sum.overdueCents ? "coral" : undefined} />
          <Kpi icon="clock" k={t("加权平均逾期")} v={`${sum.weightedDays.toFixed(0)} ${t("天")}`} s={t("按金额加权，不是按单数")} tone={sum.weightedDays > 30 ? "amber" : undefined} />
          <Kpi icon="users" k={t("涉及客户")} v={String(byCus.length)} s={t("有逾期的客户数")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜 PI 号 / 客户 / 业务员…")} />
          <select className="select select-sm" value={sales} onChange={(e) => set({ sales: e.target.value })} aria-label={t("业务员")}>
            <option value="">{t("全部业务员")}</option>
            {listSalesNames(db).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {bucket ? (
            <button className="chip" onClick={() => set({ bucket: null })}>
              {t(bucket)} <Icon name="x" size={11} />
            </button>
          ) : null}
        </>
      }
    >
      {/* 账龄分桶条：点一段就筛一段。这是这一页最高频的操作 ——
          老板扫一眼分布，然后直接点"逾期 90 天以上" */}
      <div className="aging-bar">
        {sum.buckets.map((b) => (
          <button
            key={b.bucket}
            className="aging-seg"
            data-b={b.bucket}
            data-on={bucket === b.bucket ? "1" : undefined}
            style={{ flex: Math.max(0.25, sum.total ? b.cents / sum.total : 0) }}
            onClick={() => set({ bucket: bucket === b.bucket ? null : b.bucket })}
          >
            <span className="ag-k">{t(b.bucket)}</span>
            <span className="ag-v num">{formatCompact(centsToYuan(b.cents), "$")}</span>
            <span className="ag-n">{t("{n} 单", { n: b.n })}</span>
          </button>
        ))}
      </div>

      <div className="ar-split">
        <DataGrid
          gridId="receivables"
          onExport={doExport}
          rows={rows}
          columns={columns}
          summary={[
            { k: t("当前"), v: `${rows.length}` },
            { k: t("未收合计"), v: formatCompact(centsToYuan(rows.reduce((s2, r) => s2 + r.openCents, 0)), "$") },
            { k: t("已逾期"), v: `${rows.filter((r) => r.overdue > 0).length}`, tone: "coral" as const },
          ]}
          rowTone={(r) => (r.overdue > 60 ? "coral" : r.overdue > 0 ? "amber" : undefined)}
          onRowOpen={(r) => setPick(r.bucket)}
          getRowLabel={(r) => `${r.piNo} ${r.customer}`}
          empty={<EmptyState icon="wallet" title={t("没有未收款的单")} desc={t("要么都收清了，要么当前筛选下没有。")} />}
          renderCard={(r) => (
            <button className="rcard" key={r.id} data-tone={r.overdue > 60 ? "coral" : r.overdue > 0 ? "amber" : undefined} onClick={() => setPick(r.bucket)}>
              <div className="card-row">
                <b>{r.customer}</b>
                <Pill tone={bucketTone(r.bucket)} dot={false}>
                  {r.overdue > 0 ? t("逾期 {n} 天", { n: r.overdue }) : t("未到期")}
                </Pill>
              </div>
              <div className="card-sub2">
                {r.piNo} · {t("到期")} {shortDate(r.dueOn)}
              </div>
              <div className="card-row">
                <span className="num strong">{formatMoney(centsToYuan(r.openCents), symOf(r.currency))}</span>
                <span className="muted">{r.salesName}</span>
              </div>
            </button>
          )}
        />

        <aside className="ar-side">
          <Panel title={t("按客户催收")} sub={t("催收是按客户打电话的，不是按单据")}>
            {byCus.length === 0 ? (
              <p className="muted">{t("没有逾期客户。")}</p>
            ) : (
              <ul className="cus-aging">
                {byCus.slice(0, 10).map((c) => (
                  <li key={c.id}>
                    <Flag cc={CC_BY_COUNTRY[c.country]} />
                    <div className="ca-main">
                      <div className="truncate strong">{c.customer}</div>
                      <div className="cell-sub">
                        <span>{c.sales}</span>
                        <span>·</span>
                        <span>{t("{n} 张单", { n: c.n })}</span>
                      </div>
                    </div>
                    <div className="ca-num">
                      <b className="num">{formatCompact(centsToYuan(c.cents), "$")}</b>
                      <Pill tone={c.worst > 60 ? "coral" : "amber"} dot={false}>
                        {t("最久 {n} 天", { n: c.worst })}
                      </Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 催收话术：这一段是业务知识，不是 UI。放在这里是因为
              看到"逾期 75 天"的下一秒，人想知道的就是"那我该干什么" */}
          <Panel title={t("这个档位该怎么催")} sub={pick ? t(pick) : t("点左边任意一行看对应做法")}>
            {pick ? (
              <p className="script">{t(SCRIPT[pick] ?? "")}</p>
            ) : (
              <ul className="script-list">
                {AGING_BUCKETS.filter((b) => b !== "未到期").map((b) => (
                  <li key={b}>
                    <Pill tone={bucketTone(b)} dot={false}>
                      {t(b)}
                    </Pill>
                    <p>{t(SCRIPT[b])}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("下一步")} sub={t("这一页只看得见钱，处理要去这几个地方")}>
            <ul className="mini-list">
              <li>
                <Icon name="wallet" size={13} />
                <Link to="/payments">{t("收付款 —— 收到水单在这里认领核销")}</Link>
              </li>
              <li>
                <Icon name="shield" size={13} />
                <Link to="/sinosure">{t("中信保 —— 逾期 90 天以上先查报损时限")}</Link>
              </li>
              <li>
                <Icon name="ship" size={13} />
                <Link to="/follow-ups">{t("跟单表 —— 拿住货权，未放行的先别放单")}</Link>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}

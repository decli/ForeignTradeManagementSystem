/**
 * 售前：询盘 / 报价 / 样品。
 *
 * 三页共用一套骨架，也一起打成一个懒加载分块 —— 业务员一进来是连着看的：
 * 处理询盘 → 开报价 → 顺手寄个样。
 *
 * ── 三页的排序都不是按时间倒序 ──
 * 询盘按「超时未回」顶到最前，样品按「该催的日子」顶到最前，
 * 报价按最新一版。这三页第一屏要回答的是同一个问题：**今天先干哪件**。
 * 按创建时间排序的列表，第一屏永远是刚录进来那条 —— 而它往往最不急。
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { Page, Kpi, Panel, useParam } from "@/components/ui/PageKit";
import { Bar, EmptyState, Field, KV, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { Attachments } from "@/components/Attachments";
import { QuoteDrawer } from "@/components/presales/QuoteDrawer";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { viewerOf } from "@/data/queries";
import {
  funnelOf,
  inquiryKpis,
  listInquiries,
  listQuotes,
  listSamples,
  lostStats,
  quoteKpis,
  sampleKpis,
  sourceStats,
  type InquiryRow,
  type QuoteRow,
  type SampleRow,
} from "@/data/presales-queries";
import {
  createInquiry,
  createQuote,
  createSample,
  patchSample,
  replyInquiry,
  setInquiryStatus,
} from "@/data/presales-mutations";
import {
  INQUIRY_SOURCES,
  INQUIRY_STATUS,
  LOST_REASONS,
  QUOTE_STATUS,
  SAMPLE_STATUS,
  SLA_BREACH_HOURS,
} from "@/data/presales-types";
import { centsToYuan, formatCompact, formatInt, formatMoney, relativeTime, shortDate } from "@/lib/format";
import { useTextField } from "@/lib/hooks";
import { CC_BY_COUNTRY } from "@/lib/geo";
import { unitEn } from "@/lib/docs";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };
const symOf = (c: string) => SYM[c] ?? `${c} `;

/** 走 useTextField 的输入框。表单里凡是要打中文的都得用它 */
function TextIn({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const f = useTextField(value, onChange);
  return (
    <input
      className="input"
      value={f.value}
      onChange={f.onChange}
      onCompositionStart={f.onCompositionStart}
      onCompositionEnd={f.onCompositionEnd}
      placeholder={placeholder}
      aria-label={label}
    />
  );
}

function TextArea({ value, onChange, rows = 4, label }: { value: string; onChange: (v: string) => void; rows?: number; label: string }) {
  const f = useTextField(value, onChange);
  return (
    <textarea
      className="input"
      rows={rows}
      value={f.value}
      onChange={f.onChange}
      onCompositionStart={f.onCompositionStart}
      onCompositionEnd={f.onCompositionEnd}
      aria-label={label}
    />
  );
}

/* ═══════════════════════════ 询盘管理 ═══════════════════════════ */

/**
 * SLA 徽标。
 *
 * 显示的是**小时数**，不是"超时/正常"两个字 —— 业务员要判断的是
 * "还剩多久"和"已经晚了多久"，一个布尔值答不了这个问题。
 */
function Sla({ row }: { row: InquiryRow }) {
  const { t } = useT();
  const h = row.respondHours;
  if (row.firstReplyAt) {
    return (
      <span className="sla" data-s={row.sla}>
        {h < 1 ? t("{n} 分钟", { n: Math.max(1, Math.round(h * 60)) }) : t("{n} 小时", { n: h.toFixed(h < 10 ? 1 : 0) })}
      </span>
    );
  }
  if (row.status === "won" || row.status === "lost") return <span className="muted">—</span>;
  return (
    <span className="sla" data-s={row.sla}>
      {row.sla === "breach" ? t("已拖 {n} 小时", { n: Math.round(h) }) : t("还剩 {n} 小时", { n: Math.max(0, Math.round(SLA_BREACH_HOURS - h)) })}
    </span>
  );
}

function InquiryDrawer({ row, onClose, onPrev, onNext }: { row: InquiryRow | null; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState("info");
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [follow, setFollow] = useState("");
  if (!row) return null;
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const quotes = db.presales.quotes.filter((q) => q.inquiryId === row.id).sort((a, b) => b.version - a.version);
  const samples = db.presales.samples.filter((s) => s.inquiryId === row.id);

  return (
    <>
      <Drawer
        open
        storageKey="mt.drawer.inq"
        title={
          <span className="dr-title">
            <span className="num">{row.inquiryNo}</span>
            <Pill tone={row.status === "won" ? "jade" : row.status === "lost" ? "coral" : row.status === "new" ? "amber" : "accent"}>
              {t(INQUIRY_STATUS[row.status] ?? row.status)}
            </Pill>
            {row.sla === "breach" ? <Pill tone="coral">{t("超时未回")}</Pill> : null}
          </span>
        }
        subtitle={
          <span className="dr-sub">
            <Flag cc={CC_BY_COUNTRY[row.country]} />
            {row.company} · {row.country} · {t("来自")}
            {t(row.source)}
          </span>
        }
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        tabs={[
          { key: "info", label: t("详情") },
          { key: "files", label: t("附件") },
        ]}
        tab={tab}
        onTab={setTab}
        footer={
          row.status === "won" || row.status === "lost" ? (
            <span className="muted">{t("这条已结案")}</span>
          ) : (
            <>
              <button className="btn" onClick={() => setLost(true)}>
                {t("标记流失")}
              </button>
              <span className="spacer" />
              <button
                className="btn"
                onClick={() => {
                  const r = createSample(actor, {
                    inquiryId: row.id,
                    customerId: row.customerId,
                    company: row.company,
                    country: row.country,
                    productId: row.productId,
                    qty: 5,
                    fee: 0,
                    freightBy: "客户到付",
                    ownerId: row.ownerId,
                  });
                  if (r.ok) toast(t("已建样品单，去「样品管理」补快递单号"));
                }}
              >
                <Icon name="box" size={14} />
                {t("寄样")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  createQuote(actor, {
                    inquiryId: row.id,
                    customerId: row.customerId,
                    company: row.company,
                    country: row.country,
                    ownerId: row.ownerId,
                  });
                  toast(t("已开出报价单，去「报价单」填价格"));
                }}
              >
                <Icon name="tag" size={14} />
                {t("开报价")}
              </button>
            </>
          )
        }
      >
        {tab === "info" ? (
          <div className="inqd">
            {/* 客户原话原样照录，不做摘要 —— 摘要会丢掉认证要求、
                目的港、付款方式这些决定能不能做的细节 */}
            <section className="card">
              <header className="card-head">
                <h3>{t("客户原话")}</h3>
                <span className="card-sub">{relativeTime(row.receivedAt)}</span>
              </header>
              <div className="card-body">
                <p className="inq-demand">{row.demand}</p>
              </div>
            </section>

            <div className="kvs">
              <KV k={t("联系人")} v={row.contactName ?? "—"} />
              <KV k={t("邮箱")} v={row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "—"} />
              <KV k={t("意向产品")} v={row.productName ?? t("未指明")} />
              <KV k={t("数量")} v={row.qty ? `${formatInt(row.qty)} ${row.unit}` : "—"} mono />
              <KV k={t("目标价")} v={row.targetPriceCents ? formatMoney(centsToYuan(row.targetPriceCents), "$") : "—"} mono />
              <KV k={t("业务员")} v={row.ownerName} />
              <KV k={t("首次响应")} v={<Sla row={row} />} />
              <KV k={t("已建档客户")} v={row.customerId ? <Link to={`/customers?q=${encodeURIComponent(row.company)}`}>{t("查看客户")}</Link> : t("还是潜客")} />
            </div>

            <section className="card">
              <header className="card-head">
                <h3>{t("记一次跟进")}</h3>
                <span className="card-sub">{t("第一次记录会定下首次响应时间")}</span>
              </header>
              <div className="card-body inq-follow">
                <label className="field">
                  <span>{t("下次跟进日")}</span>
                  <input className="input" type="date" value={follow} onChange={(e) => setFollow(e.target.value)} aria-label={t("下次跟进日")} />
                </label>
                <button
                  className="btn"
                  onClick={() => {
                    replyInquiry(actor, row.id, follow || null);
                    toast(t("已记录"));
                  }}
                >
                  <Icon name="check" size={14} />
                  {t("记录")}
                </button>
              </div>
            </section>

            {quotes.length ? (
              <Panel title={t("由此产生的报价")} sub={t("{n} 版", { n: quotes.length })}>
                <ul className="mini-list">
                  {quotes.map((q) => (
                    <li key={q.id}>
                      <span className="num strong">
                        {q.quoteNo} v{q.version}
                      </span>
                      <Pill tone={q.status === "converted" ? "jade" : "accent"} dot={false}>
                        {t(QUOTE_STATUS[q.status] ?? q.status)}
                      </Pill>
                      <span className="spacer" />
                      <Link to={`/quotes?q=${q.quoteNo}`}>{t("打开")}</Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {samples.length ? (
              <Panel title={t("样品")} sub={t("{n} 单", { n: samples.length })}>
                <ul className="mini-list">
                  {samples.map((s) => (
                    <li key={s.id}>
                      <span className="num strong">{s.sampleNo}</span>
                      <span className="truncate">{s.productName}</span>
                      <Pill tone="mute" dot={false}>
                        {t(SAMPLE_STATUS[s.status] ?? s.status)}
                      </Pill>
                      <span className="spacer" />
                      <Link to={`/samples?q=${s.sampleNo}`}>{t("打开")}</Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : (
          <Attachments entity="inquiry" entityId={row.id} label={row.inquiryNo} />
        )}
      </Drawer>

      <Modal
        open={lost}
        title={t("标记流失")}
        onClose={() => setLost(false)}
        footer={
          <>
            <button className="btn" onClick={() => setLost(false)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setInquiryStatus(actor, row.id, "lost", reason);
                setLost(false);
                toast(t("已标记流失"));
              }}
            >
              {t("确认")}
            </button>
          </>
        }
      >
        <p className="modal-lead">{t("流失原因会进统计 —— 丢单丢在价格上还是交期上，这是唯一说得清的地方。")}</p>
        <Field label={t("原因")}>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(r)}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </>
  );
}

export function Inquiries() {
  const db = useDb();
  const { user } = useAuth();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const viewer = viewerOf(user);
  const q = get("q");
  const status = get("status");
  const sla = get("sla");
  const source = get("source");
  const rows = useMemo(() => listInquiries(db, viewer, { q, status, sla, source }), [db, viewer, q, status, sla, source]);
  const all = useMemo(() => listInquiries(db, viewer), [db, viewer]);
  const k = inquiryKpis(all);
  const funnel = useMemo(() => funnelOf(db, viewer), [db, viewer]);
  const sources = useMemo(() => sourceStats(db, viewer), [db, viewer]);
  const lost = useMemo(() => lostStats(db, viewer), [db, viewer]);
  const [open, setOpen] = useState<InquiryRow | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: Column<InquiryRow>[] = useMemo(
    () => [
      {
        key: "company",
        title: t("客户 / 询盘号"),
        width: 232,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.company.localeCompare(b.company),
        render: (r) => (
          <>
            <div className="truncate strong">
              <Flag cc={CC_BY_COUNTRY[r.country]} />
              {r.company}
            </div>
            <div className="cell-sub">
              <span className="num">{r.inquiryNo}</span>
              <span>·</span>
              <span>{r.country}</span>
            </div>
          </>
        ),
      },
      {
        key: "demand",
        title: t("客户要什么"),
        width: 300,
        render: (r) => (
          <>
            <div className="truncate">{r.demand}</div>
            <div className="cell-sub">
              {r.productName ? <span>{r.productName}</span> : <span className="muted">{t("未指明产品")}</span>}
              {r.qty ? (
                <>
                  <span>·</span>
                  <span className="num">
                    {formatInt(r.qty)} {r.unit}
                  </span>
                </>
              ) : null}
            </div>
          </>
        ),
      },
      {
        key: "target",
        title: t("目标价"),
        width: 96,
        align: "right",
        sort: (a, b) => a.targetPriceCents - b.targetPriceCents,
        tip: t("客户自己报的心理价，砍价时的锚"),
        render: (r) => (r.targetPriceCents ? <span className="cell-num">{formatMoney(centsToYuan(r.targetPriceCents), "$")}</span> : <span className="muted">—</span>),
      },
      {
        key: "sla",
        title: t("首次响应"),
        width: 118,
        sort: (a, b) => a.respondHours - b.respondHours,
        tip: t("24 小时是行业分水岭：阿里排名权重跟它挂钩，欧美客户群发询价看谁先回"),
        render: (r) => <Sla row={r} />,
      },
      {
        key: "follow",
        title: t("下次跟进"),
        width: 116,
        sort: (a, b) => (a.followIn ?? 999) - (b.followIn ?? 999),
        render: (r) =>
          r.nextFollowOn ? (
            <>
              <div className="num">{shortDate(r.nextFollowOn)}</div>
              <div className="cell-sub">
                {r.followIn !== null && r.followIn < 0 ? <Pill tone="coral">{t("拖了 {n} 天", { n: -r.followIn })}</Pill> : <span>{t("还有 {n} 天", { n: r.followIn ?? 0 })}</span>}
              </div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      { key: "source", title: t("来源"), width: 104, render: (r) => <span>{t(r.source)}</span> },
      { key: "quotes", title: t("已报价"), width: 82, align: "right", sort: (a, b) => a.quotes - b.quotes, render: (r) => (r.quotes ? <span className="cell-num">{r.quotes} {t("版")}</span> : <span className="muted">—</span>) },
      { key: "owner", title: t("业务员"), width: 92, render: (r) => <span>{r.ownerName}</span> },
      {
        key: "status",
        title: t("状态"),
        width: 106,
        render: (r) => (
          <>
            <Pill tone={r.status === "won" ? "jade" : r.status === "lost" ? "coral" : r.status === "new" ? "amber" : "accent"}>{t(INQUIRY_STATUS[r.status] ?? r.status)}</Pill>
            {r.lostReason ? <div className="cell-sub">{t(r.lostReason)}</div> : null}
          </>
        ),
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("询盘管理")}
      desc={t("从阿里 / 独立站 / 展会来的询盘，分配到人、按时回、跟到底 · 排序把超时未回的顶在最前")}
      actions={
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} />
          {t("新建询盘")}
        </button>
      }
      kpis={
        <>
          <Kpi icon="inbox" k={t("在跟询盘")} v={String(k.open)} s={t("待处理 + 跟进中")} />
          <Kpi icon="alert" k={t("超时未回")} v={String(k.breach)} s={t("超过 {n} 小时没回", { n: SLA_BREACH_HOURS })} tone={k.breach ? "coral" : undefined} />
          <Kpi icon="clock" k={t("平均首次响应")} v={`${k.avgHours.toFixed(1)}h`} s={t("越快越靠前")} tone={k.avgHours > SLA_BREACH_HOURS ? "amber" : undefined} />
          <Kpi icon="target" k={t("询盘成交率")} v={`${k.winRate.toFixed(0)}%`} s={t("成交 {n} 单 · 分母只算已结案", { n: k.won })} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜公司 / 询盘号 / 需求 / 产品…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[
              { value: "", label: t("全部"), count: all.length },
              { value: "new", label: t("待处理"), count: all.filter((r) => r.status === "new").length },
              { value: "working", label: t("跟进中"), count: all.filter((r) => r.status === "working").length },
              { value: "quoted", label: t("已报价"), count: all.filter((r) => r.status === "quoted").length },
              { value: "won", label: t("已成交"), count: all.filter((r) => r.status === "won").length },
            ]}
            label={t("状态")}
          />
          <button className={`btn${sla === "breach" ? " is-on" : ""}`} onClick={() => set({ sla: sla === "breach" ? null : "breach" })} data-tip={t("只看超时未回的")}>
            <Icon name="alert" size={13} />
            {t("超时 {n}", { n: all.filter((r) => r.sla === "breach").length })}
          </button>
          <select className="select select-sm" value={source} onChange={(e) => set({ source: e.target.value })} aria-label={t("来源")}>
            <option value="">{t("全部来源")}</option>
            {INQUIRY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="presale-split">
        <DataGrid
          gridId="inquiries"
          exportName={t("询盘")}
          rows={rows}
          columns={columns}
          /* 表头上方那条原来只放一个「列」按钮，右边全空。放当前筛选下的合计，
             用户不用滚到底也不用心算 */
          summary={[
            { k: t("当前"), v: `${rows.length}` },
            { k: t("超时未回"), v: `${rows.filter((r) => r.sla === "breach").length}`, tone: "coral" as const },
            { k: t("该跟进"), v: `${rows.filter((r) => r.followIn !== null && r.followIn < 0).length}`, tone: "amber" as const },
            { k: t("已报价"), v: `${rows.filter((r) => r.quotes > 0).length}` },
          ].filter((x) => x.v !== "0" || x.k === t("当前"))}
          onRowOpen={setOpen}
          getRowLabel={(r) => `${r.inquiryNo} ${r.company}`}
          rowTone={(r) => (r.sla === "breach" ? "coral" : r.followIn !== null && r.followIn < 0 ? "amber" : undefined)}
          empty={<EmptyState icon="inbox" title={t("没有符合条件的询盘")} desc={t("换个筛选，或者点右上角新建一条。")} />}
          /* 窄屏卡片：外壳由页面给（DataGrid 只负责排版），
             做成 button 才能点开详情 —— 手机上没有"整行可点"这回事，
             一个不能点的卡片会被当成静态列表 */
          renderCard={(r) => (
            <button className="rcard" key={r.id} data-tone={r.sla === "breach" ? "coral" : undefined} onClick={() => setOpen(r)}>
              <div className="card-row">
                <b>{r.company}</b>
                <Sla row={r} />
              </div>
              <div className="card-sub2">{r.demand}</div>
              <div className="card-row">
                <span className="num">{r.inquiryNo}</span>
                <Pill tone={r.status === "new" ? "amber" : "accent"}>{t(INQUIRY_STATUS[r.status] ?? r.status)}</Pill>
              </div>
            </button>
          )}
        />

        {/* 漏斗和来源统计放右侧。它们不是"报表"，是回答业务员每天那个问题的：
            我这一摊卡在哪一环 */}
        <aside className="presale-side">
          <Panel title={t("售前漏斗")} sub={t("相邻两段的通过率")}>
            {/* 寄样是可选分支（现货直接报价，打样才寄），单独一行、分母用询盘总数。
                串进主链会算出 125% 这种数 —— 那不是算错，是建模错 */}
            <ul className="funnel">
              {funnel.map((s, i) => (
                <li key={s.key} data-branch={s.branch ? "1" : undefined}>
                  <span className="fn-k">{t(s.key)}</span>
                  <span className="fn-bar">
                    <i style={{ width: `${funnel[0].n ? (s.n / funnel[0].n) * 100 : 0}%` }} />
                  </span>
                  <span className="fn-n num">{s.n}</span>
                  <span className="fn-r num" data-weak={funnel[0].n > 0 && i > 0 && !s.branch && s.rate < 40 ? "1" : undefined}>
                    {i === 0 ? "" : `${s.rate.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t("来源与成交率")} sub={t("投在哪个渠道值")}>
            {sources.length === 0 ? <p className="muted">{t("还没有询盘。")}</p> : null}
            <ul className="srcs">
              {sources.map((s) => (
                <li key={s.source}>
                  <span className="truncate">{t(s.source)}</span>
                  <span className="num muted">{s.n}</span>
                  <Bar value={s.won} max={s.n} tone={s.rate >= 30 ? "jade" : ""} />
                  <span className="num">{s.rate.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </Panel>
          {lost.length ? (
            <Panel title={t("流失原因")} sub={t("共 {n} 条", { n: lost.reduce((a, b) => a + b.n, 0) })}>
              <ul className="srcs">
                {lost.map((l) => (
                  <li key={l.reason}>
                    <span className="truncate">{t(l.reason)}</span>
                    <span className="spacer" />
                    <span className="num">{l.n}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>

      <InquiryDrawer
        row={open}
        onClose={() => setOpen(null)}
        onPrev={() => {
          const i = rows.findIndex((r) => r.id === open?.id);
          if (i > 0) setOpen(rows[i - 1]);
        }}
        onNext={() => {
          const i = rows.findIndex((r) => r.id === open?.id);
          if (i >= 0 && i < rows.length - 1) setOpen(rows[i + 1]);
        }}
      />

      <NewInquiry open={adding} onClose={() => setAdding(false)} lang={lang} />
    </Page>
  );
}

function NewInquiry({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: string }) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const [f, setF] = useState({ company: "", country: "", contactName: "", email: "", im: "", source: INQUIRY_SOURCES[0] as string, demand: "", productId: "", qty: "", targetPrice: "" });
  const up = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  return (
    <Modal
      open={open}
      title={t("新建询盘")}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const r = createInquiry(
                { id: user?.id ?? null, name: user?.name ?? "—" },
                {
                  company: f.company,
                  country: f.country,
                  contactName: f.contactName,
                  email: f.email,
                  im: f.im,
                  source: f.source,
                  demand: f.demand,
                  productId: f.productId || null,
                  qty: f.qty ? Number(f.qty) : null,
                  targetPrice: f.targetPrice ? Number(f.targetPrice) : 0,
                  ownerId: user?.id ?? null,
                  customerId: db.customers.find((c) => c.name === f.company)?.id ?? null,
                },
              );
              if (!r.ok) {
                toastError(r.error);
                return;
              }
              toast(t("已录入，SLA 从现在开始计时"));
              setF({ company: "", country: "", contactName: "", email: "", im: "", source: INQUIRY_SOURCES[0], demand: "", productId: "", qty: "", targetPrice: "" });
              onClose();
            }}
          >
            {t("录入")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("公司名")} hint={t("已建档的客户直接输同名，会自动挂上")}>
          <TextIn value={f.company} onChange={(v) => up({ company: v })} label={t("公司名")} />
        </Field>
        <Field label={t("国家")}>
          <TextIn value={f.country} onChange={(v) => up({ country: v })} label={t("国家")} />
        </Field>
        <Field label={t("联系人")}>
          <TextIn value={f.contactName} onChange={(v) => up({ contactName: v })} label={t("联系人")} />
        </Field>
        <Field label={t("邮箱")}>
          <TextIn value={f.email} onChange={(v) => up({ email: v })} label={t("邮箱")} />
        </Field>
        <Field label={t("来源")}>
          <select className="select" value={f.source} onChange={(e) => up({ source: e.target.value })}>
            {INQUIRY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("意向产品")}>
          <select className="select" value={f.productId} onChange={(e) => up({ productId: e.target.value })}>
            <option value="">{t("未指明")}</option>
            {db.ops.products.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === "en" ? (p.nameEn ?? p.name) : p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("数量")}>
          <input className="input" type="number" value={f.qty} onChange={(e) => up({ qty: e.target.value })} aria-label={t("数量")} />
        </Field>
        <Field label={t("目标单价")} hint={t("客户自己报的价，美元")}>
          <input className="input" type="number" step="0.0001" value={f.targetPrice} onChange={(e) => up({ targetPrice: e.target.value })} aria-label={t("目标单价")} />
        </Field>
      </div>
      <Field label={t("客户原话")} hint={t("原样粘贴，别做摘要 —— 认证要求和付款方式往往就藏在里面")}>
        <TextArea value={f.demand} onChange={(v) => up({ demand: v })} label={t("客户原话")} />
      </Field>
    </Modal>
  );
}

/* ═══════════════════════════ 报价单 ═══════════════════════════ */

export function Quotes() {
  const db = useDb();
  const { user } = useAuth();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const viewer = viewerOf(user);
  const q = get("q");
  const status = get("status");
  const rows = useMemo(() => listQuotes(db, viewer, { q, status }), [db, viewer, q, status]);
  const all = useMemo(() => listQuotes(db, viewer), [db, viewer]);
  const k = quoteKpis(all);
  const [open, setOpen] = useState<QuoteRow | null>(null);

  const columns: Column<QuoteRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("报价号"),
        width: 176,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.quoteNo.localeCompare(b.quoteNo),
        render: (r) => (
          <>
            <div className="truncate strong">
              <span className="num">{r.quoteNo}</span>
              {r.versions > 1 ? (
                <Pill tone="violet" dot={false} className="ml4">
                  v{r.version}/{r.versions}
                </Pill>
              ) : null}
            </div>
            <div className="cell-sub">
              <span>{shortDate(r.createdAt)}</span>
              <span>·</span>
              <span>{r.ownerName}</span>
            </div>
          </>
        ),
      },
      {
        key: "company",
        title: t("客户"),
        width: 200,
        sort: (a, b) => a.company.localeCompare(b.company),
        render: (r) => (
          <>
            <div className="truncate">
              <Flag cc={CC_BY_COUNTRY[r.country]} />
              {r.company}
            </div>
            <div className="cell-sub">
              <span>
                {r.incoterm} {r.pod || "—"}
              </span>
            </div>
          </>
        ),
      },
      {
        key: "goods",
        title: t("报什么"),
        width: 210,
        render: (r) => (
          <>
            {/* 品名和单位都跟界面语言走。英文界面里出现"一次性防护服（XL 码）· 48,700 件"
                是最刺眼的一种半吊子本地化 */}
            <div className="truncate">{(lang === "en" ? r.lines[0]?.nameEn || r.lines[0]?.name : r.lines[0]?.name) ?? t("还没填明细")}</div>
            <div className="cell-sub">{r.lineCount > 1 ? <span>{t("等 {n} 项", { n: r.lineCount })}</span> : r.lines[0] ? <span className="num">{formatInt(r.lines[0].qty)} {lang === "en" ? unitEn(r.lines[0].unit) : r.lines[0].unit}</span> : null}</div>
          </>
        ),
      },
      {
        key: "total",
        title: t("报价总额"),
        width: 124,
        align: "right",
        sort: (a, b) => a.totalCents - b.totalCents,
        render: (r) => <span className="cell-num strong">{formatMoney(centsToYuan(r.totalCents), symOf(r.currency))}</span>,
      },
      {
        key: "margin",
        title: t("利润率"),
        width: 118,
        align: "right",
        sort: (a, b) => a.marginBp - b.marginBp,
        tip: t("含退税。低于 11% 红线的会标黄"),
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <Pill tone={r.marginBp < 0 ? "coral" : r.marginBp < 1100 ? "amber" : "jade"} dot={false}>
              {(r.marginBp / 100).toFixed(2)}%
            </Pill>
            {r.deltaBp ? (
              <span className="num" style={{ fontSize: 11, color: r.deltaBp < 0 ? "var(--coral)" : "var(--jade)" }}>
                {r.deltaBp < 0 ? "▼" : "▲"} {Math.abs(r.deltaBp / 100).toFixed(2)}pt
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "valid",
        title: t("有效期"),
        width: 118,
        sort: (a, b) => a.expireIn - b.expireIn,
        render: (r) => (
          <>
            <div className="num">{shortDate(r.validUntil)}</div>
            <div className="cell-sub">
              {r.expireIn < 0 ? <Pill tone="mute">{t("已过期")}</Pill> : r.expireIn <= 3 ? <Pill tone="amber">{t("{n} 天后过期", { n: r.expireIn })}</Pill> : <span>{t("还有 {n} 天", { n: r.expireIn })}</span>}
            </div>
          </>
        ),
      },
      {
        key: "status",
        title: t("状态"),
        width: 116,
        render: (r) => (
          <>
            <Pill tone={r.status === "converted" ? "jade" : r.status === "rejected" || r.status === "expired" ? "coral" : r.status === "negotiating" ? "amber" : "accent"}>
              {t(QUOTE_STATUS[r.status] ?? r.status)}
            </Pill>
            {r.piNo ? (
              <div className="cell-sub">
                <span className="num">{r.piNo}</span>
              </div>
            ) : null}
          </>
        ),
      },
    ],
    [t, lang],
  );

  return (
    <Page
      title={t("报价单")}
      desc={t("带核算器的报价：成本 + 运费 + 保险 − 退税，正算利润、反算报价 · 议价每让一次价都留一版")}
      kpis={
        <>
          <Kpi icon="tag" k={t("在谈报价")} v={String(k.live)} s={t("已发出 + 议价中")} />
          <Kpi icon="wallet" k={t("在谈金额")} v={formatCompact(centsToYuan(k.liveValue), "$")} s={t("按各自币种直接相加，看量级用")} />
          <Kpi icon="target" k={t("报价成交率")} v={`${k.winRate.toFixed(0)}%`} s={t("分母只算已定案的")} />
          <Kpi icon="alert" k={t("低于红线")} v={String(k.lowMargin)} s={t("利润率 < 11%，要走审批")} tone={k.lowMargin ? "amber" : undefined} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜报价号 / 客户 / 品名 / 目的港…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[
              { value: "", label: t("全部"), count: all.length },
              { value: "draft", label: t("草稿"), count: all.filter((r) => r.status === "draft").length },
              { value: "sent", label: t("已发出"), count: all.filter((r) => r.status === "sent").length },
              { value: "negotiating", label: t("议价中"), count: all.filter((r) => r.status === "negotiating").length },
              { value: "converted", label: t("已转 PI"), count: all.filter((r) => r.status === "converted").length },
            ]}
            label={t("状态")}
          />
          <span className="spacer" />
          {k.expiring ? (
            <span className="hint-inline">
              <Icon name="clock" size={13} />
              {t("{n} 张 3 天内过期", { n: k.expiring })}
            </span>
          ) : null}
        </>
      }
    >
      <DataGrid
        gridId="quotes"
        exportName={t("报价单")}
        rows={rows}
        columns={columns}
        summary={[
          { k: t("当前"), v: `${rows.length}` },
          { k: t("金额合计"), v: formatCompact(centsToYuan(rows.reduce((s2, r) => s2 + r.totalCents, 0)), "$") },
          { k: t("平均利润率"), v: rows.length ? `${(rows.reduce((s2, r) => s2 + r.marginBp, 0) / rows.length / 100).toFixed(1)}%` : "—" },
          { k: t("低于红线"), v: `${rows.filter((r) => r.marginBp < 1100).length}`, tone: "amber" as const },
        ]}
        onRowOpen={setOpen}
        getRowLabel={(r) => `${r.quoteNo} ${r.company}`}
        rowTone={(r) => (r.marginBp < 0 ? "coral" : r.marginBp < 1100 ? "amber" : undefined)}
        empty={<EmptyState icon="tag" title={t("还没有报价单")} desc={t("从询盘里点「开报价」，产品和数量会带过来。")} />}
        renderCard={(r) => (
          <button className="rcard" key={r.id} data-tone={r.marginBp < 1100 ? "amber" : undefined} onClick={() => setOpen(r)}>
            <div className="card-row">
              <b className="num">
                {r.quoteNo} v{r.version}
              </b>
              <Pill tone={r.marginBp < 1100 ? "amber" : "jade"} dot={false}>
                {(r.marginBp / 100).toFixed(1)}%
              </Pill>
            </div>
            <div className="card-sub2">
              {r.company} · {r.incoterm} {r.pod}
            </div>
            <div className="card-row">
              <span className="num strong">{formatMoney(centsToYuan(r.totalCents), symOf(r.currency))}</span>
              <Pill tone="accent">{t(QUOTE_STATUS[r.status] ?? r.status)}</Pill>
            </div>
          </button>
        )}
      />

      <QuoteDrawer
        row={open}
        onClose={() => setOpen(null)}
        onPrev={() => {
          const i = rows.findIndex((r) => r.id === open?.id);
          if (i > 0) setOpen(rows[i - 1]);
        }}
        onNext={() => {
          const i = rows.findIndex((r) => r.id === open?.id);
          if (i >= 0 && i < rows.length - 1) setOpen(rows[i + 1]);
        }}
      />
    </Page>
  );
}

/* ═══════════════════════════ 样品管理 ═══════════════════════════ */

export function Samples() {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const { get, set } = useParam();
  const viewer = viewerOf(user);
  const q = get("q");
  const status = get("status");
  const rows = useMemo(() => listSamples(db, viewer, { q, status }), [db, viewer, q, status]);
  const all = useMemo(() => listSamples(db, viewer), [db, viewer]);
  const k = sampleKpis(all);
  const [open, setOpen] = useState<SampleRow | null>(null);
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };

  const columns: Column<SampleRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("样品单 / 客户"),
        width: 224,
        freeze: true,
        hideable: false,
        render: (r) => (
          <>
            <div className="truncate strong">
              <Flag cc={CC_BY_COUNTRY[r.country]} />
              {r.company}
            </div>
            <div className="cell-sub">
              <span className="num">{r.sampleNo}</span>
              <span>·</span>
              <span>{r.ownerName}</span>
            </div>
          </>
        ),
      },
      {
        key: "product",
        title: t("样品"),
        width: 210,
        render: (r) => (
          <>
            <div className="truncate">{r.productName}</div>
            <div className="cell-sub">
              <span className="num">{r.qty} pcs</span>
              <span>·</span>
              <span>{r.feeCents ? formatMoney(centsToYuan(r.feeCents), "$") : t("免费样")}</span>
              <span>·</span>
              <span>{t(r.freightBy)}</span>
            </div>
          </>
        ),
      },
      {
        key: "courier",
        title: t("快递"),
        width: 150,
        render: (r) =>
          r.trackingNo ? (
            <>
              <div>{r.courier}</div>
              <div className="cell-sub">
                <span className="num">{r.trackingNo}</span>
              </div>
            </>
          ) : (
            <span className="muted">{t("还没寄")}</span>
          ),
      },
      {
        key: "follow",
        title: t("该催的日子"),
        width: 132,
        sort: (a, b) => (a.followIn ?? 999) - (b.followIn ?? 999),
        tip: t("寄出自动定 12 天后，签收自动改成 5 天后 —— 样品寄出去没下文是最常见的漏斗断点"),
        render: (r) =>
          r.followOn ? (
            <>
              <div className="num">{shortDate(r.followOn)}</div>
              <div className="cell-sub">
                {r.followIn !== null && r.followIn < 0 ? <Pill tone="coral">{t("早该催了 {n} 天", { n: -r.followIn })}</Pill> : <span>{t("还有 {n} 天", { n: r.followIn ?? 0 })}</span>}
              </div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "silent",
        title: t("寄出多久"),
        width: 104,
        align: "right",
        sort: (a, b) => (a.silentDays ?? -1) - (b.silentDays ?? -1),
        render: (r) => (r.silentDays === null ? <span className="muted">—</span> : <span className="cell-num" style={{ color: r.silentDays > 14 ? "var(--coral)" : undefined }}>{r.silentDays} {t("天")}</span>),
      },
      {
        key: "status",
        title: t("状态"),
        width: 118,
        render: (r) => <Pill tone={r.status === "closed" ? "mute" : r.status === "feedback" ? "jade" : r.status === "requested" ? "amber" : "accent"}>{t(SAMPLE_STATUS[r.status] ?? r.status)}</Pill>,
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("样品管理")}
      desc={t("寄样登记、快递跟踪、到期催反馈 · 列表按「该催的日子」排序，早该催的顶在最前")}
      kpis={
        <>
          <Kpi icon="box" k={t("在跟样品")} v={String(k.live)} s={t("未关闭的样品单")} />
          <Kpi icon="alert" k={t("该催没催")} v={String(k.overdue)} s={t("过了该催的日子")} tone={k.overdue ? "coral" : undefined} />
          <Kpi icon="clock" k={t("超 14 天没反馈")} v={String(k.silent)} s={t("寄出去就没下文的")} tone={k.silent ? "amber" : undefined} />
          <Kpi icon="wallet" k={t("样品费合计")} v={formatMoney(centsToYuan(k.cost), "$")} s={t("多数在大单里退回")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜样品号 / 客户 / 产品 / 快递单号…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[
              { value: "", label: t("全部"), count: all.length },
              { value: "requested", label: t("待寄出"), count: all.filter((r) => r.status === "requested").length },
              { value: "sent", label: t("已寄出"), count: all.filter((r) => r.status === "sent").length },
              { value: "delivered", label: t("客户已收"), count: all.filter((r) => r.status === "delivered").length },
              { value: "feedback", label: t("已反馈"), count: all.filter((r) => r.status === "feedback").length },
            ]}
            label={t("状态")}
          />
        </>
      }
    >
      <DataGrid
        gridId="samples"
        exportName={t("样品")}
        rows={rows}
        columns={columns}
        summary={[
          { k: t("当前"), v: `${rows.length}` },
          { k: t("该催没催"), v: `${rows.filter((r) => r.status !== "closed" && r.followIn !== null && r.followIn < 0).length}`, tone: "coral" as const },
          { k: t("样品费"), v: formatMoney(centsToYuan(rows.reduce((s2, r) => s2 + r.feeCents, 0)), "$") },
        ]}
        onRowOpen={setOpen}
        getRowLabel={(r) => `${r.sampleNo} ${r.company}`}
        rowTone={(r) => (r.status !== "closed" && r.followIn !== null && r.followIn < 0 ? "coral" : undefined)}
        empty={<EmptyState icon="box" title={t("还没有样品单")} desc={t("从询盘详情里点「寄样」建单。")} />}
        renderCard={(r) => (
          <button className="rcard" key={r.id} data-tone={r.status !== "closed" && r.followIn !== null && r.followIn < 0 ? "coral" : undefined} onClick={() => setOpen(r)}>
            <div className="card-row">
              <b>{r.company}</b>
              <Pill tone="accent">{t(SAMPLE_STATUS[r.status] ?? r.status)}</Pill>
            </div>
            <div className="card-sub2">{r.productName}</div>
            <div className="card-row">
              <span className="num">{r.sampleNo}</span>
              {r.followIn !== null && r.followIn < 0 ? <Pill tone="coral">{t("早该催了")}</Pill> : null}
            </div>
          </button>
        )}
      />

      {open ? (
        <Drawer
          open
          storageKey="mt.drawer.sample"
          title={
            <span className="dr-title">
              <span className="num">{open.sampleNo}</span>
              <Pill tone={open.status === "feedback" ? "jade" : "accent"}>{t(SAMPLE_STATUS[open.status] ?? open.status)}</Pill>
            </span>
          }
          subtitle={
            <span className="dr-sub">
              <Flag cc={CC_BY_COUNTRY[open.country]} />
              {open.company} · {open.productName}
            </span>
          }
          onClose={() => setOpen(null)}
        >
          <div className="kvs">
            <KV k={t("数量")} v={`${open.qty} pcs`} mono />
            <KV k={t("样品费")} v={open.feeCents ? formatMoney(centsToYuan(open.feeCents), "$") : t("免费样")} mono />
            <KV k={t("运费")} v={t(open.freightBy)} />
            <KV k={t("申请日")} v={shortDate(open.requestedOn)} />
            <KV k={t("业务员")} v={open.ownerName} />
          </div>

          <section className="card">
            <header className="card-head">
              <h3>{t("寄样进度")}</h3>
              <span className="card-sub">{t("填上寄出日，系统自动定 12 天后该催；填上签收日，改成 5 天后")}</span>
            </header>
            <div className="card-body form-grid">
              <Field label={t("快递公司")}>
                <select className="select" value={open.courier ?? ""} onChange={(e) => patchSample(actor, open.id, { courier: e.target.value })}>
                  <option value="">—</option>
                  {["DHL", "FedEx", "UPS", "SF Express", "EMS"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("快递单号")}>
                <TextIn value={open.trackingNo ?? ""} onChange={(v) => patchSample(actor, open.id, { trackingNo: v })} label={t("快递单号")} />
              </Field>
              <Field label={t("寄出日")}>
                <input className="input" type="date" value={open.sentOn ?? ""} onChange={(e) => patchSample(actor, open.id, { sentOn: e.target.value, status: "sent" })} aria-label={t("寄出日")} />
              </Field>
              <Field label={t("客户签收日")}>
                <input className="input" type="date" value={open.deliveredOn ?? ""} onChange={(e) => patchSample(actor, open.id, { deliveredOn: e.target.value, status: "delivered" })} aria-label={t("签收日")} />
              </Field>
              <Field label={t("该催的日子")}>
                <input className="input" type="date" value={open.followOn ?? ""} onChange={(e) => patchSample(actor, open.id, { followOn: e.target.value })} aria-label={t("该催的日子")} />
              </Field>
              <Field label={t("状态")}>
                <select className="select" value={open.status} onChange={(e) => patchSample(actor, open.id, { status: e.target.value })}>
                  {Object.entries(SAMPLE_STATUS).map(([k2, v]) => (
                    <option key={k2} value={k2}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <Field label={t("客户反馈")} hint={t("原样记下来 —— 下一版打样要照着改的就是这几句")}>
            <TextArea value={open.feedback ?? ""} onChange={(v) => patchSample(actor, open.id, { feedback: v, status: v ? "feedback" : open.status })} label={t("客户反馈")} />
          </Field>

          <Attachments entity="sample" entityId={open.id} label={open.sampleNo} compact />
        </Drawer>
      ) : null}
    </Page>
  );
}

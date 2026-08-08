import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { StackBar } from "@/components/charts";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Drawer } from "@/components/ui/Drawer";
import { toast } from "@/components/ui/Toast";
import { Bar, Chip, EmptyState, KV, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { customRate, getOrderDetail, listEntities, listOrders, listSalesNames, orderKpis, type OrderRow } from "@/data/queries";
import { formatCompact, formatMoney, formatPct } from "@/lib/format";
import { MASK, canSeeCost } from "@/lib/perms";
import { PROFIT_WARN_PCT, REVIEW_LABEL, RELEASE_TONE, profitTone } from "@/lib/rules";
import { exportXlsx, stampName } from "@/lib/xlsx";

export default function Orders({ mine = false }: { mine?: boolean }) {
  const { t } = useT();
  const db = useDb();
  const { viewer, user } = useAuth();
  const seeCost = canSeeCost(user);
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const settle = params.get("settle") ?? "";
  const sales = mine ? (user?.name ?? "") : (params.get("sales") ?? "");
  const entity = params.get("entity") ?? "";
  const onlyRisk = params.get("risk") === "1";
  const archived = params.get("archived") === "1";
  const openId = params.get("id");

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const rows = useMemo(
    () => listOrders(db, viewer, { q, settleState: settle, sales, entity, onlyRisk, archived }),
    [db, viewer, q, settle, sales, entity, onlyRisk, archived],
  );
  const allRows = useMemo(() => listOrders(db, viewer, { sales: mine ? sales : "" }), [db, viewer, mine, sales]);
  const rate = customRate(db);
  const kpi = useMemo(() => orderKpis(allRows, rate), [allRows, rate]);
  const entities = useMemo(() => listEntities(db), [db]);
  const salesNames = useMemo(() => listSalesNames(db), [db]);

  const openIndex = openId ? rows.findIndex((r) => r.id === openId) : -1;

  const chips = [
    settle && { k: t("结算"), v: settle, clear: () => set({ settle: null }) },
    !mine && sales && { k: t("业务员"), v: sales, clear: () => set({ sales: null }) },
    entity && { k: t("开票主体"), v: entity, clear: () => set({ entity: null }) },
    onlyRisk && { k: t("只看"), v: t("利润率预警"), clear: () => set({ risk: null }) },
    q && { k: t("搜索"), v: q, clear: () => set({ q: null }) },
  ].filter(Boolean) as { k: string; v: string; clear: () => void }[];

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: "pi",
        title: t("PI 号 / 签约"),
        width: 168,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.piNo.localeCompare(b.piNo),
        render: (r) => (
          <>
            <div className="cell-main">{r.piNo}</div>
            <div className="cell-sub">
              <span className="num">{r.signedOn.slice(5)}</span>
              <span>· {r.sellerEntity ?? "—"}</span>
            </div>
          </>
        ),
      },
      {
        key: "customer",
        title: t("客户 / 目的国"),
        width: 168,
        sort: (a, b) => a.customerName.localeCompare(b.customerName),
        render: (r) => (
          <>
            <div className="truncate">{r.customerName}</div>
            <div className="cell-sub">
              <span>{r.destination}</span>
            </div>
          </>
        ),
      },
      {
        key: "product",
        title: t("产品"),
        width: 200,
        render: (r) => (
          <span className="truncate" title={r.product ?? ""} style={{ display: "block" }}>
            {r.product ?? "—"}
          </span>
        ),
      },
      {
        key: "sales",
        title: t("业务员"),
        width: 88,
        sort: (a, b) => a.salesName.localeCompare(b.salesName),
        render: (r) => r.salesName,
      },
      {
        key: "amount",
        title: t("订单额"),
        width: 118,
        align: "right",
        sort: (a, b) => a.amount - b.amount,
        render: (r) => <span className="cell-num">{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</span>,
      },
      {
        key: "cost",
        title: t("采购成本"),
        width: 118,
        align: "right",
        sort: (a, b) => a.purchaseCost - b.purchaseCost,
        tip: seeCost ? undefined : t("你的角色看不到采购成本"),
        /* 字段级权限：业务员看得见这一行，看不见这一列。
           用 •••• 而不是破折号 —— 破折号会被读成"这单没有成本"，
           而实际是"有，但不给你看"，核账时这两件事天差地别。见 lib/perms.ts */
        render: (r) =>
          seeCost ? (
            <span className="cell-num muted">{r.purchaseCost ? formatMoney(r.purchaseCost, "¥") : "—"}</span>
          ) : (
            <span className="cell-num masked" data-tip={t("你的角色看不到采购成本")}>{MASK}</span>
          ),
      },
      {
        key: "rate",
        title: t("利润率"),
        width: 116,
        align: "right",
        sort: (a, b) => a.profitRate - b.profitRate,
        tip: t("低于 {p}% 进预警队列", { p: PROFIT_WARN_PCT }),
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <Pill tone={profitTone(r.profitRate)} dot={false}>
              {formatPct(r.profitRate)}
            </Pill>
            <div style={{ width: 68 }}>
              <Bar value={Math.max(0, r.profitRate)} max={30} tone={profitTone(r.profitRate)} />
            </div>
          </div>
        ),
      },
      {
        key: "settle",
        title: t("结算 / 复核"),
        width: 122,
        sort: (a, b) => a.settleState.localeCompare(b.settleState),
        render: (r) => (
          <>
            <Pill tone={r.settleState === "已完结" ? "jade" : "mute"}>{r.settleState}</Pill>
            <div className="cell-sub">
              <span>{REVIEW_LABEL[r.reviewState] ?? r.reviewState}</span>
            </div>
          </>
        ),
      },
      {
        key: "flag",
        title: t("数据完整性"),
        width: 126,
        render: (r) =>
          r.flag ? (
            <Pill tone={r.flag === "亏损" ? "coral" : r.flag === "利润率偏低" ? "amber" : "mute"}>{r.flag}</Pill>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "ship",
        title: t("出运"),
        width: 78,
        align: "right",
        sort: (a, b) => a.shipmentCount - b.shipmentCount,
        render: (r) => <span className="cell-num">{r.shipmentCount || "—"}</span>,
      },
    ],
    [t, seeCost],
  );

  const doExport = async () => {
    await exportXlsx<OrderRow>(
      stampName("订单核算"),
      [
        { header: t("PI 号"), width: 18, value: (r) => r.piNo },
        { header: t("签约日"), width: 12, type: "date", value: (r) => r.signedOn },
        { header: t("客户"), width: 22, value: (r) => r.customerName },
        { header: t("目的国"), width: 12, value: (r) => r.destination },
        { header: t("产品"), width: 34, value: (r) => r.product },
        { header: t("业务员"), width: 10, value: (r) => r.salesName },
        { header: t("开票主体"), width: 14, value: (r) => r.sellerEntity },
        { header: t("币种"), width: 8, value: (r) => r.currency },
        { header: t("订单额"), width: 14, type: "number", value: (r) => r.amount },
        { header: t("采购成本(CNY)"), width: 16, type: "number", value: (r) => r.purchaseCost },
        { header: t("应收"), width: 14, type: "number", value: (r) => r.receivable },
        { header: t("应付(CNY)"), width: 14, type: "number", value: (r) => r.payable },
        { header: t("利润率"), width: 10, type: "number", format: "0.00%", value: (r) => r.profitRate / 100 },
        { header: t("毛利"), width: 14, type: "number", value: (r) => r.grossProfit },
        { header: t("结算状态"), width: 10, value: (r) => r.settleState },
        { header: t("复核状态"), width: 10, value: (r) => REVIEW_LABEL[r.reviewState] ?? r.reviewState },
        { header: t("提醒"), width: 14, value: (r) => r.flag },
      ],
      rows,
    );
    toast(t("已导出 {n} 行（跟随当前筛选）", { n: rows.length }));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{mine ? t("我的订单") : t("订单核算跟踪")}</h1>
          <p>
            {mine ? t("只看 {who} 名下的单", { who: user?.name ?? "" }) : t("每个 PI 一行")}
            {t(" · 成本超支自动进入复核 · 点行下钻看成本构成与收付款")}
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-k">
            <Icon name="inbox" />
            {t("订单总数")}
          </span>
          <span className="kpi-v">{kpi.total}</span>
          <span className="kpi-s">{t("未完结 {n} 张", { n: kpi.unsettled })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-k">
            <Icon name="wallet" />
            {t("在跟订单额")}
          </span>
          <span className="kpi-v">{formatCompact(kpi.totalUsd)}</span>
          <span className="kpi-s">{t("人民币单按 {r} 折算并入", { r: rate.toFixed(4) })}</span>
        </div>
        <button className="kpi" data-tone={kpi.warn ? "amber" : undefined} onClick={() => set({ risk: onlyRisk ? null : "1" })}>
          <span className="kpi-k">
            <Icon name="gauge" />
            {t("利润率预警")}
          </span>
          <span className="kpi-v">{kpi.warn}</span>
          <span className="kpi-s">{t("低于 {p}% · 点这里只看它们", { p: PROFIT_WARN_PCT })}</span>
        </button>
        <div className="kpi" data-tone={kpi.loss ? "coral" : undefined}>
          <span className="kpi-k">
            <Icon name="alert" />
            {t("负毛利")}
          </span>
          <span className="kpi-v">{kpi.loss}</span>
          <span className="kpi-s">{t("成本已超报价，需财务复核")}</span>
        </div>
        <div className="kpi" data-tone={kpi.avgRate < PROFIT_WARN_PCT ? "amber" : "jade"}>
          <span className="kpi-k">
            <Icon name="target" />
            {t("平均利润率")}
          </span>
          <span className="kpi-v">{formatPct(kpi.avgRate, 1)}</span>
          <span className="kpi-s">{t("当前数据范围内")}</span>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜 PI 号 / 客户 / 产品…")} />
        <Segmented
          value={archived ? "archived" : "open"}
          onChange={(v) => set({ archived: v === "archived" ? "1" : null })}
          options={[
            { value: "open", label: t("在跟进") },
            { value: "archived", label: t("已归档") },
          ]}
          label={t("订单状态")}
        />
        <span className="toolbar-sep" />
        <select className="select" value={settle} onChange={(e) => set({ settle: e.target.value })} aria-label={t("结算状态")}>
          <option value="">{t("结算：全部")}</option>
          <option value="未完结">{t("未完结")}</option>
          <option value="已完结">{t("已完结")}</option>
        </select>
        {!mine ? (
          <select className="select" value={sales} onChange={(e) => set({ sales: e.target.value })} aria-label={t("业务员")}>
            <option value="">{t("业务员：全部")}</option>
            {salesNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}
        <select className="select" value={entity} onChange={(e) => set({ entity: e.target.value })} aria-label={t("开票主体")}>
          <option value="">{t("开票主体：全部")}</option>
          {entities.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="switch">
          <input type="checkbox" checked={onlyRisk} onChange={(e) => set({ risk: e.target.checked ? "1" : null })} />
          {t("只看利润率预警")}
        </label>
        <span className="spacer" />
        {chips.length ? (
          <div className="chips">
            {chips.map((c) => (
              <Chip key={`${c.k}${c.v}`} label={c.k} value={c.v} onClear={c.clear} />
            ))}
          </div>
        ) : null}
      </div>

      <DataGrid<OrderRow>
        gridId="orders"
        onExport={doExport}
        rows={rows}
        columns={columns}
        rowTone={(r) => (r.profitRate < 0 ? "coral" : r.profitRate < PROFIT_WARN_PCT ? "amber" : undefined)}
        onRowOpen={(r) => set({ id: r.id })}
        bar={
          <>
            <span>
              {t("本页")} <b className="num">{rows.length}</b> {t("张订单")}
            </span>
            <span className="hint" style={{ marginLeft: 0 }}>
              {t("金额合计 {v}", { v: formatCompact(rows.reduce((s, r) => s + (r.currency === "CNY" ? r.amount / rate : r.amount), 0)) })}
            </span>
          </>
        }
        empty={
          <EmptyState
            icon="inbox"
            title={t("当前筛选下没有订单")}
            desc={onlyRisk ? t("没有利润率低于预警线的订单 —— 这是好事。") : t("换个筛选条件试试，或者去「PI 取号」建第一张。")}
          />
        }
        renderCard={(r) => (
          <button className="rcard" key={r.id} data-tone={r.profitRate < 0 ? "coral" : r.profitRate < PROFIT_WARN_PCT ? "amber" : undefined} onClick={() => set({ id: r.id })}>
            <div className="rcard-top">
              <span className="cell-main truncate">{r.piNo}</span>
              <span className="spacer" />
              <Pill tone={profitTone(r.profitRate)} dot={false}>
                {formatPct(r.profitRate)}
              </Pill>
            </div>
            <div className="rcard-meta">
              <span>{r.customerName}</span>
              <span>{r.destination}</span>
              <span>{r.salesName}</span>
            </div>
            <div className="rcard-note clamp-2">{r.product ?? "—"}</div>
            <div className="rcard-kv">
              <div>
                <span>{t("订单额")}</span>
                <b>{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</b>
              </div>
              <div>
                <span>{t("结算")}</span>
                <b style={{ fontFamily: "var(--sans)", fontSize: "var(--fs-md)" }}>{r.settleState}</b>
              </div>
              <div>
                <span>{t("出运")}</span>
                <b>{r.shipmentCount || "—"}</b>
              </div>
            </div>
          </button>
        )}
      />

      {openId ? (
        <OrderDrawer
          id={openId}
          onClose={() => set({ id: null })}
          onPrev={openIndex > 0 ? () => set({ id: rows[openIndex - 1].id }) : undefined}
          onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => set({ id: rows[openIndex + 1].id }) : undefined}
        />
      ) : null}
    </div>
  );
}

function OrderDrawer({ id, onClose, onPrev, onNext }: { id: string; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const { t } = useT();
  const db = useDb();
  const d = useMemo(() => getOrderDetail(db, id), [db, id]);
  if (!d) return null;

  const totalCost = d.costs.reduce((s, c) => s + c.value, 0);

  return (
    <Drawer
      open
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      storageKey="mt.drawer.orders.w"
      title={
        <>
          <span className="num">{d.piNo}</span>
          <Pill tone={profitTone(d.profitRate)} dot={false}>
            {t("利润率 {p}", { p: formatPct(d.profitRate) })}
          </Pill>
          <Pill tone={d.settleState === "已完结" ? "jade" : "mute"}>{d.settleState}</Pill>
        </>
      }
      subtitle={
        <>
          <span>
            {d.customerName} · {d.destination}
          </span>
          <span>{t("· 签约 {d}", { d: d.signedOn })}</span>
          <span>· {d.sellerEntity ?? t("未指定主体")}</span>
        </>
      }
      footer={
        <>
          <Link className="btn btn-sm" to={`/customers?id=${d.customerId ?? ""}`}>
            <Icon name="users" />
            {t("看客户档案")}
          </Link>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {t("复核状态：{s}", { s: t(REVIEW_LABEL[d.reviewState] ?? d.reviewState) })}
          </span>
        </>
      }
    >
      <div className="sect">
        <div className="sect-h">
          <Icon name="wallet" size={14} />
          {t("金额")}
        </div>
        <div className="kv-grid">
          <KV k={t("订单额")} v={formatMoney(d.amount, d.currency === "CNY" ? "¥" : "$")} mono />
          <KV k={t("预估毛利")} v={formatMoney(d.grossProfit, d.currency === "CNY" ? "¥" : "$")} mono />
          <KV k={t("已收")} v={formatMoney(d.receivable)} mono />
          <KV k={t("应付")} v={formatMoney(d.payable, "¥")} mono />
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ marginBottom: 6, fontSize: "var(--fs-sm)", color: "var(--text-3)" }}>
            <span>{t("收款进度")}</span>
            <span className="spacer" />
            <span className="num">
              {d.amount ? Math.round((d.receivable / d.amount) * 100) : 0}%
            </span>
          </div>
          <Bar value={d.receivable} max={d.amount} tone={d.receivable >= d.amount ? "jade" : "amber"} />
        </div>
      </div>

      {d.costs.length ? (
        <div className="sect">
          <div className="sect-h">
            <Icon name="pie" size={14} />
            {t("成本构成")}
            <span className="spacer" />
            <span className="num" style={{ fontWeight: 400 }}>{t("合计 ¥{v}", { v: Math.round(totalCost).toLocaleString("en-US") })}</span>
          </div>
          <StackBar items={d.costs} />
        </div>
      ) : (
        <div className="sect">
          <EmptyState icon="pie" title={t("还没有录成本")} desc={t("采购成本、海运费、报关费录进来之后，这里会出现成本构成。")} />
        </div>
      )}

      <div className="sect">
        <div className="sect-h">
          <Icon name="ship" size={14} />
          {t("关联出运批次 {n}", { n: d.shipments.length ? `（${d.shipments.length}）` : "" })}
        </div>
        {d.shipments.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--fs-md)" }}>{t("这张 PI 还没有出运批次。")}</p>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {d.shipments.map((s) => (
              <Link
                key={s.id}
                to={`/follow-ups?id=${s.id}`}
                className="row"
                style={{ padding: "8px 0", borderBottom: "1px solid var(--line-2)", color: "inherit" }}
              >
                <span className="batch-cell">
                  <b className="cell-main">{s.batchNo}</b>
                  {s.batchLabel ? <span className="badge-batch">{s.batchLabel}</span> : null}
                </span>
                <span className="spacer" />
                <span className="num muted" style={{ fontSize: "var(--fs-sm)" }}>{s.containerNo ?? t("待订舱")}</span>
                <Pill tone={RELEASE_TONE[s.releaseState] ?? "mute"}>{s.releaseState}</Pill>
                <Icon name="chevronRight" size={14} style={{ color: "var(--text-4)" }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="sect">
        <div className="sect-h">
          <Icon name="file" size={14} />
          {t("关联退税发票 {n}", { n: d.taxInvoices.length ? `（${d.taxInvoices.length}）` : "" })}
        </div>
        {d.taxInvoices.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--fs-md)" }}>{t("还没有发票挂到这张 PI 上。")}</p>
        ) : (
          <>
            {d.taxInvoices.map((t) => (
              <div key={t.id} className="row" style={{ padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
                <span className="num">{t.invoiceNo}</span>
                <span className="spacer" />
                <span className="num">¥{t.tax.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="row" style={{ paddingTop: 8 }}>
              <b>{t("退税额合计")}</b>
              <span className="spacer" />
              <b className="num" style={{ color: "var(--jade)" }}>
                ¥{d.taxInvoices.reduce((s, t) => s + t.tax, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </b>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

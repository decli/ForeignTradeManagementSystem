import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { Chip, EmptyState, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { listBuyers, listDeclareMonths, listEntities, listTaxInvoices, suggestPis, taxKpis, type TaxRow } from "@/data/queries";
import { linkInvoice } from "@/data/mutations";
import { formatCompact, formatInt, formatMoney } from "@/lib/format";
import { exportXlsx, stampName } from "@/lib/xlsx";

export default function TaxRefund() {
  const { t } = useT();
  const db = useDb();
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [linking, setLinking] = useState<TaxRow | null>(null);
  const readOnly = !can("write");

  const q = params.get("q") ?? "";
  const entity = params.get("entity") ?? "";
  const month = params.get("month") ?? "";
  const buyer = params.get("buyer") ?? "";
  const onlyUnlinked = params.get("unlinked") === "1";

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

  const rows = useMemo(() => listTaxInvoices(db, { q, entity, month, buyer, onlyUnlinked }), [db, q, entity, month, buyer, onlyUnlinked]);
  const kpi = useMemo(() => taxKpis(db, entity, month), [db, entity, month]);
  const entities = useMemo(() => listEntities(db), [db]);
  const months = useMemo(() => listDeclareMonths(db), [db]);
  const buyers = useMemo(() => listBuyers(db), [db]);

  // 税额合计跟着筛选实时重算 —— 财务筛完一段就想直接看这个数
  const sums = useMemo(
    () => ({
      tax: rows.reduce((s, r) => s + r.tax, 0),
      gross: rows.reduce((s, r) => s + r.gross, 0),
      usd: rows.reduce((s, r) => s + r.customsUsd, 0),
    }),
    [rows],
  );

  const chips = [
    entity && { k: t("开票主体"), v: entity, clear: () => set({ entity: null }) },
    month && { k: t("申报月"), v: month, clear: () => set({ month: null }) },
    buyer && { k: t("采购员"), v: buyer, clear: () => set({ buyer: null }) },
    onlyUnlinked && { k: t("只看"), v: t("未关联订单"), clear: () => set({ unlinked: null }) },
    q && { k: t("搜索"), v: q, clear: () => set({ q: null }) },
  ].filter(Boolean) as { k: string; v: string; clear: () => void }[];

  const columns: Column<TaxRow>[] = useMemo(
    () => [
      {
        key: "invoice",
        title: t("发票号 / 申报月"),
        width: 152,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.invoiceNo.localeCompare(b.invoiceNo),
        render: (r) => (
          <>
            <div className="cell-main">{r.invoiceNo}</div>
            <div className="cell-sub">
              <span className="num">{r.declareMonth}</span>
              <span>{t("· 第 {n} 批", { n: r.batch })}</span>
            </div>
          </>
        ),
      },
      {
        key: "pi",
        title: t("关联订单"),
        width: 148,
        sort: (a, b) => (a.piNo ?? "").localeCompare(b.piNo ?? ""),
        render: (r) =>
          r.piNo ? (
            <span className="num">{r.piNo}</span>
          ) : (
            <button className="btn btn-sm" disabled={readOnly} onClick={() => setLinking(r)} style={{ color: "var(--coral)", borderColor: "var(--coral-soft)" }}>
              <Icon name="link" />
              {t("未关联 · 去挂")}
            </button>
          ),
      },
      {
        key: "seller",
        title: t("销售方"),
        width: 240,
        sort: (a, b) => a.sellerName.localeCompare(b.sellerName),
        render: (r) => (
          <span className="truncate" title={r.sellerName} style={{ display: "block" }}>
            {r.sellerName}
          </span>
        ),
      },
      {
        key: "item",
        title: t("商品名称"),
        width: 240,
        render: (r) => (
          <span className="truncate" title={r.item} style={{ display: "block" }}>
            {r.item}
          </span>
        ),
      },
      { key: "qty", title: t("数量"), width: 96, align: "right", sort: (a, b) => a.qty - b.qty, render: (r) => <span className="cell-num">{formatInt(r.qty)}</span> },
      { key: "gross", title: t("价税合计"), width: 118, align: "right", sort: (a, b) => a.gross - b.gross, render: (r) => <span className="cell-num">{formatMoney(r.gross, "¥")}</span> },
      { key: "net", title: t("不含税金额"), width: 118, align: "right", sort: (a, b) => a.net - b.net, render: (r) => <span className="cell-num muted">{formatMoney(r.net, "¥")}</span> },
      {
        key: "tax",
        title: t("税额"),
        width: 112,
        align: "right",
        sort: (a, b) => a.tax - b.tax,
        render: (r) => (
          <span className="cell-num" style={{ color: "var(--jade)", fontWeight: 600 }}>
            {formatMoney(r.tax, "¥")}
          </span>
        ),
      },
      { key: "customs", title: t("报关单号"), width: 158, render: (r) => <span className="num truncate" style={{ display: "block", fontSize: "var(--fs-sm)" }}>{r.customsNo ?? "—"}</span> },
      { key: "usd", title: t("报关美元"), width: 112, align: "right", sort: (a, b) => a.customsUsd - b.customsUsd, render: (r) => <span className="cell-num">{r.customsUsd ? formatMoney(r.customsUsd) : "—"}</span> },
      { key: "exported", title: t("出口日期"), width: 106, sort: (a, b) => (a.exportedOn ?? "").localeCompare(b.exportedOn ?? ""), render: (r) => <span className="num">{r.exportedOn ?? "—"}</span> },
      { key: "buyer", title: t("采购员"), width: 82, render: (r) => r.buyer },
      { key: "entity", title: t("开票主体"), width: 100, render: (r) => <Pill tone={r.entity === "供应链" ? "violet" : "accent"}>{r.entity ?? "—"}</Pill> },
    ],
    [readOnly],
  );

  const doExport = async () => {
    await exportXlsx<TaxRow>(
      stampName("退税明细"),
      [
        { header: t("申报月"), width: 10, value: (r) => r.declareMonth },
        { header: t("批次"), width: 8, value: (r) => r.batch },
        { header: t("发票号"), width: 14, value: (r) => r.invoiceNo },
        { header: t("关联 PI"), width: 16, value: (r) => r.piNo },
        { header: t("销售方"), width: 32, value: (r) => r.sellerName },
        { header: t("商品名称"), width: 32, value: (r) => r.item },
        { header: t("数量"), width: 12, type: "number", format: "#,##0", value: (r) => r.qty },
        { header: t("价税合计"), width: 14, type: "number", value: (r) => r.gross },
        { header: t("不含税"), width: 14, type: "number", value: (r) => r.net },
        { header: t("税额"), width: 14, type: "number", value: (r) => r.tax },
        { header: t("出口日期"), width: 12, type: "date", value: (r) => r.exportedOn },
        { header: t("报关单号"), width: 20, value: (r) => r.customsNo },
        { header: t("报关美元"), width: 14, type: "number", value: (r) => r.customsUsd },
        { header: t("采购员"), width: 10, value: (r) => r.buyer },
        { header: t("开票主体"), width: 12, value: (r) => r.entity },
      ],
      rows,
    );
    toast(t("已导出 {n} 行（跟随当前筛选）", { n: rows.length }));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("退税管理")}</h1>
          <p>{t("出口退税发票明细台账 · 未关联订单的行会标红并可一键挂到 PI")}</p>
        </div>
        <div className="page-acts">
          <button className="btn" onClick={doExport}>
            <Icon name="download" />
            {t("导出 Excel")}
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-k">
            <Icon name="file" />
            {t("{y} 年退税额", { y: kpi.year })}
          </span>
          <span className="kpi-v">{formatCompact(kpi.yearTax, "¥")}</span>
          <span className="kpi-s">{t("{e} · 已开票口径", { e: entity || t("全部主体") })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-k">
            <Icon name="calendar" />
            {t("{m} 申报", { m: kpi.monthLabel })}
          </span>
          <span className="kpi-v">{formatCompact(kpi.monthTax, "¥")}</span>
          <span className="kpi-s">{t("切换申报月只影响这张卡")}</span>
        </div>
        <div className="kpi">
          <span className="kpi-k">
            <Icon name="inbox" />
            {t("发票行数")}
          </span>
          <span className="kpi-v">{kpi.lines}</span>
          <span className="kpi-s">{t("当前主体全量")}</span>
        </div>
        <button className="kpi" data-tone={kpi.unlinked ? "coral" : "jade"} onClick={() => set({ unlinked: onlyUnlinked ? null : "1" })}>
          <span className="kpi-k">
            <Icon name="unlink" />
            {t("未关联订单")}
          </span>
          <span className="kpi-v">{kpi.unlinked}</span>
          <span className="kpi-s">{kpi.unlinked ? t("点这里只看它们") : t("全部已挂到 PI")}</span>
        </button>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜发票号 / 报关单号 / 销售方 / 商品…")} />
        <Segmented
          value={entity}
          onChange={(v) => set({ entity: v })}
          options={[{ value: "", label: t("全部主体") }, ...entities.map((e) => ({ value: e, label: e }))]}
          label={t("开票主体")}
        />
        <span className="toolbar-sep" />
        <select className="select" value={month} onChange={(e) => set({ month: e.target.value })} aria-label={t("申报月")}>
          <option value="">{t("申报月：全部")}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="select" value={buyer} onChange={(e) => set({ buyer: e.target.value })} aria-label={t("采购员")}>
          <option value="">{t("采购员：全部")}</option>
          {buyers.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <label className="switch">
          <input type="checkbox" checked={onlyUnlinked} onChange={(e) => set({ unlinked: e.target.checked ? "1" : null })} />
          {t("只看未关联")}
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

      <DataGrid<TaxRow>
        gridId="tax"
        rows={rows}
        columns={columns}
        rowTone={(r) => (r.piNo ? undefined : "coral")}
        onRowOpen={(r) => !r.piNo && !readOnly && setLinking(r)}
        bar={
          <>
            <span>
              {t("本页")} <b className="num">{rows.length}</b> {t("行")}
            </span>
            <Pill tone="jade" dot={false}>
              {t("税额合计 ¥{v}", { v: sums.tax.toLocaleString("en-US", { maximumFractionDigits: 2 }) })}
            </Pill>
            <Pill tone="mute" dot={false}>
              {t("价税合计 ¥{v}", { v: Math.round(sums.gross).toLocaleString("en-US") })}
            </Pill>
            <Pill tone="mute" dot={false}>
              {t("报关 ${v}", { v: Math.round(sums.usd).toLocaleString("en-US") })}
            </Pill>
          </>
        }
        empty={<EmptyState icon="file" title={t("当前筛选下没有发票")} desc={t("换个申报月或开票主体试试。")} />}
        renderCard={(r) => (
          <div className="rcard" key={r.id} data-tone={r.piNo ? undefined : "coral"}>
            <div className="rcard-top">
              <span className="cell-main">{r.invoiceNo}</span>
              <span className="spacer" />
              <Pill tone={r.entity === "供应链" ? "violet" : "accent"}>{r.entity ?? "—"}</Pill>
            </div>
            <div className="rcard-meta">
              <span className="num">{r.declareMonth}</span>
              <span>{r.buyer}</span>
              <span className="num">{r.customsNo ?? "—"}</span>
            </div>
            <div className="rcard-note clamp-2">{r.sellerName} · {r.item}</div>
            <div className="rcard-kv">
              <div>
                <span>{t("税额")}</span>
                <b style={{ color: "var(--jade)" }}>{formatMoney(r.tax, "¥")}</b>
              </div>
              <div>
                <span>{t("价税合计")}</span>
                <b>{formatMoney(r.gross, "¥")}</b>
              </div>
              <div>
                <span>{t("关联")}</span>
                {r.piNo ? (
                  <b>{r.piNo}</b>
                ) : (
                  <button className="btn btn-sm" disabled={readOnly} onClick={() => setLinking(r)}>
                    {t("去关联")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      />

      {linking ? (
        <LinkWizard
          row={linking}
          onClose={() => setLinking(null)}
          onLink={(piId, piNo) => {
            const res = linkInvoice({ id: user?.id ?? null, name: user?.name ?? "—" }, linking.id, piId);
            setLinking(null);
            toast(t("{inv} 已挂到 {pi}", { inv: linking.invoiceNo, pi: piNo }), () => {
              linkInvoice({ id: user?.id ?? null, name: user?.name ?? "—" }, linking.id, res.before);
              toast("已撤销关联");
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** 关联向导：按报关美元额跟 PI 金额的接近度推荐，再让人搜一遍确认 */
function LinkWizard({ row, onClose, onLink }: { row: TaxRow; onClose: () => void; onLink: (piId: string, piNo: string) => void }) {
  const { t } = useT();
  const db = useDb();
  const [q, setQ] = useState("");
  const candidates = useMemo(() => suggestPis(db, row.id, q), [db, row.id, q]);

  return (
    <Modal
      open
      title={t("把 {inv} 关联到订单", { inv: row.invoiceNo })}
      onClose={onClose}
      width={620}
      footer={
        <>
          <span className="muted" style={{ fontSize: "var(--fs-sm)", marginRight: "auto" }}>
            {t("关联之后 5 秒内可以撤销")}
          </span>
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, paddingBottom: 6 }}>
        <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
          <div className="card-body" style={{ padding: 12 }}>
            <div className="kv-grid">
              <div className="kv">
                <span>{t("销售方")}</span>
                <div className="truncate">{row.sellerName}</div>
              </div>
              <div className="kv">
                <span>{t("商品")}</span>
                <div className="truncate">{row.item}</div>
              </div>
              <div className="kv">
                <span>{t("报关美元")}</span>
                <div className="num">{row.customsUsd ? formatMoney(row.customsUsd) : "—"}</div>
              </div>
              <div className="kv">
                <span>{t("出口日期")}</span>
                <div className="num">{row.exportedOn ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <SearchInput value={q} onChange={setQ} placeholder={t("搜 PI 号 / 客户 / 产品…")} autoFocus />

        <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 2 }}>
          {candidates.length === 0 ? (
            <EmptyState icon="search" title={t("没有匹配的 PI")} desc={t("换个关键词，或者先去 PI 取号建一张。")} />
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                className="citem"
                onClick={() => onLink(c.id, c.piNo)}
                style={{ border: "1px solid var(--line-2)" }}
              >
                <div className="citem-top">
                  <b className="num">{c.piNo}</b>
                  {c.score > 0.9 ? <Pill tone="jade">{t("金额高度吻合")}</Pill> : c.score > 0.7 ? <Pill tone="accent">{t("金额接近")}</Pill> : null}
                  <span className="spacer" />
                  <span className="num">{formatMoney(c.amount, c.currency === "CNY" ? "¥" : "$")}</span>
                </div>
                <div className="cell-sub">
                  <span>
                    {t("{cust} · {prod} · 签约 {d}", { cust: c.customerName, prod: c.product ?? "—", d: c.signedOn })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

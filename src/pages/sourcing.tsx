/**
 * 采购协同：供应商 / 产品 / 询价 / 采购合同 / 生产单。
 *
 * 这五个模块共用一套骨架（页头 + KPI + 工具条 + DataGrid），所以放在一个文件里，
 * 也一起打成一个懒加载分块 —— 采购的人一进来往往会连着看这几页。
 */

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Drawer } from "@/components/ui/Drawer";
import { Bar, EmptyState, KV, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import {
  getRfqQuotes,
  listContracts,
  listProductions,
  listProducts,
  listRfqs,
  listSuppliers,
  productCategories,
  type ContractRow,
  type ProductRow,
  type ProductionRow,
  type RfqRow,
  type SupplierRow,
} from "@/data/ops-queries";
import { CONTRACT_STATUS, PRODUCTION_STATUS, RFQ_STATUS } from "@/data/ops-types";
import { useT } from "@/i18n";
import { formatCompact, formatInt, formatMoney, formatPct } from "@/lib/format";
import { exportXlsx, stampName } from "@/lib/xlsx";

/** 页面骨架：所有采购页长得一样，标题以外的差别只有筛选和列 */
function Page({
  title,
  desc,
  kpis,
  toolbar,
  children,
  actions,
}: {
  title: string;
  desc: string;
  kpis?: React.ReactNode;
  toolbar: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
        {actions ? <div className="page-acts">{actions}</div> : null}
      </div>
      {kpis ? <div className="kpis">{kpis}</div> : null}
      <div className="toolbar">{toolbar}</div>
      <div className="page-body">{children}</div>
    </div>
  );
}

function Kpi({ icon, k, v, s, tone }: { icon: Parameters<typeof Icon>[0]["name"]; k: string; v: string; s: string; tone?: string }) {
  return (
    <div className="kpi" data-tone={tone}>
      <span className="kpi-k">
        <Icon name={icon} />
        {k}
      </span>
      <span className="kpi-v">{v}</span>
      <span className="kpi-s">{s}</span>
    </div>
  );
}

/** 列表页的 URL 参数读写，跟跟单表一个做法：筛选写进地址栏 */
function useParam() {
  const [params, setParams] = useSearchParams();
  const get = (k: string, d = "") => params.get(k) ?? d;
  const set = (patch: Record<string, string | null>) =>
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
  return { get, set };
}

/* ═══════════════════ 供应商管理 ═══════════════════ */

export function Suppliers() {
  const db = useDb();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const rows = useMemo(() => listSuppliers(db, q), [db, q]);
  const [open, setOpen] = useState<SupplierRow | null>(null);

  const expiring = rows.filter((s) => s.certDays !== null && s.certDays < 90);
  const expired = rows.filter((s) => s.certDays !== null && s.certDays < 0);

  const columns: Column<SupplierRow>[] = useMemo(
    () => [
      {
        key: "name",
        title: t("供应商"),
        width: 250,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.name.localeCompare(b.name),
        render: (r) => (
          <>
            <div className="truncate strong">{lang === "en" ? (r.nameEn ?? r.name) : r.name}</div>
            <div className="cell-sub">
              <span>
                {r.code} · {r.province} · {r.category}
              </span>
            </div>
          </>
        ),
      },
      { key: "contact", title: t("联系人"), width: 130, render: (r) => (<><div>{r.contact ?? "—"}</div><div className="cell-sub"><span className="num">{r.phone ?? "—"}</span></div></>) },
      {
        key: "score",
        title: t("供货评分"),
        width: 130,
        align: "right",
        sort: (a, b) => a.score - b.score,
        tip: t("交期、品质、配合度的加权"),
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <Pill tone={r.score >= 88 ? "jade" : r.score >= 78 ? "accent" : "amber"} dot={false}>
              {r.score}
            </Pill>
            <div style={{ width: 64 }}>
              <Bar value={r.score} max={100} tone={r.score >= 88 ? "jade" : r.score >= 78 ? "" : "amber"} />
            </div>
          </div>
        ),
      },
      { key: "onTime", title: t("准时交付率"), width: 110, align: "right", sort: (a, b) => a.onTimeRate - b.onTimeRate, render: (r) => <span className="cell-num" style={{ color: r.onTimeRate < 80 ? "var(--coral)" : undefined }}>{r.onTimeRate}%</span> },
      { key: "term", title: t("账期"), width: 92, align: "right", sort: (a, b) => a.termDays - b.termDays, render: (r) => <span className="cell-num">{r.termDays ? `${r.termDays} ${t("天")}` : t("款到发货")}</span> },
      {
        key: "cert",
        title: t("资质到期"),
        width: 138,
        sort: (a, b) => (a.certDays ?? 9999) - (b.certDays ?? 9999),
        tip: t("过期就不能下单"),
        render: (r) =>
          r.certExpiry ? (
            <>
              <div className="num">{r.certExpiry}</div>
              <div className="cell-sub">
                {r.certDays !== null && r.certDays < 0 ? (
                  <Pill tone="coral">{t("已过期 {n} 天", { n: -r.certDays })}</Pill>
                ) : r.certDays !== null && r.certDays < 90 ? (
                  <Pill tone="amber">{t("{n} 天后到期", { n: r.certDays })}</Pill>
                ) : (
                  <span>{t("有效")}</span>
                )}
              </div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      { key: "contracts", title: t("在手合同"), width: 100, align: "right", sort: (a, b) => a.contracts - b.contracts, render: (r) => <span className="cell-num">{r.contracts || "—"}</span> },
      { key: "amount", title: t("采购金额"), width: 130, align: "right", sort: (a, b) => a.amount - b.amount, render: (r) => <span className="cell-num">{r.amount ? formatMoney(r.amount, "¥") : "—"}</span> },
      { key: "unpaid", title: t("未付余额"), width: 130, align: "right", sort: (a, b) => a.unpaid - b.unpaid, render: (r) => <span className="cell-num" style={{ color: r.unpaid > 0 ? "var(--amber)" : undefined }}>{r.unpaid ? formatMoney(r.unpaid, "¥") : "—"}</span> },
    ],
    [t, lang],
  );

  return (
    <Page
      title={t("供应商管理")}
      desc={t("供应商档案、资质有效期与供货评分 · 资质过期的会标红并挡住下单")}
      kpis={
        <>
          <Kpi icon="building" k={t("供应商")} v={String(rows.length)} s={t("在册且启用")} />
          <Kpi icon="alert" k={t("资质已过期")} v={String(expired.length)} s={expired.length ? expired[0].name.slice(0, 10) + "…" : t("全部有效")} tone={expired.length ? "coral" : undefined} />
          <Kpi icon="clock" k={t("90 天内到期")} v={String(expiring.length - expired.length)} s={t("需提前提醒换证")} tone={expiring.length > expired.length ? "amber" : undefined} />
          <Kpi icon="wallet" k={t("未付余额")} v={formatCompact(rows.reduce((s, r) => s + r.unpaid, 0), "¥")} s={t("按合同金额减已付")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜供应商 / 编号 / 品类 / 联系人…")} />
        </>
      }
    >
      <DataGrid<SupplierRow>
        gridId="suppliers"
        rows={rows}
        columns={columns}
        onExport={() =>
          exportXlsx<SupplierRow>(
            stampName(t("供应商")),
            [
              { header: t("编号"), width: 10, value: (r) => r.code },
              { header: t("供应商"), width: 32, value: (r) => r.name },
              { header: t("品类"), width: 12, value: (r) => r.category },
              { header: t("省份"), width: 10, value: (r) => r.province },
              { header: t("联系人"), width: 12, value: (r) => r.contact },
              { header: t("账期"), width: 10, type: "number", format: "0", value: (r) => r.termDays },
              { header: t("供货评分"), width: 10, type: "number", format: "0", value: (r) => r.score },
              { header: t("资质到期"), width: 12, type: "date", value: (r) => r.certExpiry },
              { header: t("采购金额"), width: 16, type: "number", value: (r) => r.amount },
              { header: t("未付余额"), width: 16, type: "number", value: (r) => r.unpaid },
            ],
            rows,
          )
        }
        rowTone={(r) => (r.certDays !== null && r.certDays < 0 ? "coral" : r.certDays !== null && r.certDays < 90 ? "amber" : undefined)}
        onRowOpen={setOpen}
        empty={<EmptyState icon="building" title={t("没有匹配的供应商")} desc={t("换个关键词试试，或者清空搜索。")} />}
        renderCard={(r) => (
          <button className="rcard" key={r.id} onClick={() => setOpen(r)} data-tone={r.certDays !== null && r.certDays < 0 ? "coral" : undefined}>
            <div className="rcard-top">
              <span className="strong truncate">{r.name}</span>
              <span className="spacer" />
              <Pill tone={r.score >= 88 ? "jade" : "accent"} dot={false}>{r.score}</Pill>
            </div>
            <div className="rcard-meta">
              <span>{r.category}</span>
              <span>{r.province}</span>
              <span>{r.contact ?? "—"}</span>
            </div>
            <div className="rcard-kv">
              <div><span>{t("在手合同")}</span><b>{r.contracts}</b></div>
              <div><span>{t("未付余额")}</span><b>{formatMoney(r.unpaid, "¥")}</b></div>
              <div><span>{t("账期")}</span><b>{r.termDays}</b></div>
            </div>
          </button>
        )}
      />

      {open ? <SupplierDrawer row={open} onClose={() => setOpen(null)} /> : null}
    </Page>
  );
}

function SupplierDrawer({ row, onClose }: { row: SupplierRow; onClose: () => void }) {
  const db = useDb();
  const { t } = useT();
  const contracts = useMemo(() => listContracts(db, { supplier: row.name }), [db, row.name]);
  const productions = useMemo(() => listProductions(db).filter((p) => p.supplierName === row.name), [db, row.name]);

  return (
    <Drawer
      open
      onClose={onClose}
      storageKey="tw.drawer.supplier.w"
      title={
        <>
          {row.name}
          <Pill tone={row.score >= 88 ? "jade" : row.score >= 78 ? "accent" : "amber"} dot={false}>
            {t("评分")} {row.score}
          </Pill>
          {row.certDays !== null && row.certDays < 0 ? <Pill tone="coral">{t("资质已过期")}</Pill> : null}
        </>
      }
      subtitle={<span>{row.code} · {row.province} · {row.category}</span>}
    >
      <div className="sect">
        <div className="sect-h"><Icon name="info" size={14} />{t("档案")}</div>
        <div className="kv-grid">
          <KV k={t("联系人")} v={row.contact ?? "—"} />
          <KV k={t("电话")} v={row.phone ?? "—"} mono />
          <KV k={t("账期")} v={row.termDays ? `${row.termDays} ${t("天")}` : t("款到发货")} />
          <KV k={t("准时交付率")} v={`${row.onTimeRate}%`} mono />
          <KV k={t("税号")} v={row.taxNo ?? "—"} mono />
          <KV k={t("开户行")} v={row.bank ?? "—"} />
        </div>
        {row.note ? (
          <div style={{ marginTop: 12, padding: 12, background: "var(--surface-2)", borderRadius: "var(--r-md)", fontSize: "var(--fs-md)", lineHeight: 1.6 }}>
            {row.note}
          </div>
        ) : null}
      </div>

      <div className="sect">
        <div className="sect-h"><Icon name="file" size={14} />{t("采购合同")} {contracts.length ? `（${contracts.length}）` : ""}</div>
        {contracts.length === 0 ? (
          <p className="muted">{t("还没有跟这家签过合同。")}</p>
        ) : (
          contracts.slice(0, 10).map((c) => (
            <div key={c.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
              <b className="num">{c.contractNo}</b>
              <span className="muted truncate" style={{ flex: 1, fontSize: "var(--fs-sm)" }}>{c.productName}</span>
              <span className="num">{formatMoney(c.amount, "¥")}</span>
              <Pill tone={c.status === "closed" ? "mute" : c.status === "executing" ? "accent" : "jade"}>{t(CONTRACT_STATUS[c.status] ?? c.status)}</Pill>
            </div>
          ))
        )}
      </div>

      <div className="sect">
        <div className="sect-h"><Icon name="play" size={14} />{t("生产单")} {productions.length ? `（${productions.length}）` : ""}</div>
        {productions.length === 0 ? (
          <p className="muted">{t("没有在产的单。")}</p>
        ) : (
          productions.slice(0, 10).map((p) => (
            <div key={p.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
              <b className="num">{p.orderNo}</b>
              <span className="muted truncate" style={{ flex: 1, fontSize: "var(--fs-sm)" }}>{p.productName}</span>
              <span className="num" style={{ fontSize: "var(--fs-sm)" }}>{formatPct(p.progress * 100, 0)}</span>
              <Pill tone={p.late ? "coral" : p.status === "done" ? "jade" : "accent"}>{t(PRODUCTION_STATUS[p.status] ?? p.status)}</Pill>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
}

/* ═══════════════════ 产品管理 ═══════════════════ */

export function Products() {
  const db = useDb();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const cat = get("cat");
  const rows = useMemo(() => listProducts(db, q, cat), [db, q, cat]);
  const cats = useMemo(() => productCategories(db), [db]);

  const columns: Column<ProductRow>[] = useMemo(
    () => [
      {
        key: "sku",
        title: t("SKU / 品名"),
        width: 240,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.sku.localeCompare(b.sku),
        render: (r) => (
          <>
            <div className="cell-main">{r.sku}</div>
            <div className="cell-sub"><span>{lang === "en" ? (r.nameEn ?? r.name) : r.name}</span></div>
          </>
        ),
      },
      { key: "cat", title: t("品类"), width: 100, render: (r) => <Pill tone="mute">{r.category}</Pill> },
      {
        key: "hs",
        title: t("HS 编码"),
        width: 130,
        sort: (a, b) => a.hsCode.localeCompare(b.hsCode),
        tip: t("报关与退税率都从这取"),
        render: (r) => <span className="num">{r.hsCode}</span>,
      },
      { key: "refund", title: t("退税率"), width: 92, align: "right", sort: (a, b) => a.refundRate - b.refundRate, render: (r) => <Pill tone="jade" dot={false}>{formatPct(r.refundRate, 0)}</Pill> },
      { key: "cost", title: t("最近采购价"), width: 120, align: "right", sort: (a, b) => a.lastCost - b.lastCost, render: (r) => <span className="cell-num">{formatMoney(r.lastCost, "¥")}<span className="muted">/{r.unit}</span></span> },
      { key: "pack", title: t("标准装箱"), width: 110, align: "right", render: (r) => <span className="cell-num">{formatInt(r.packQty)}<span className="muted">/{t("箱")}</span></span> },
      {
        key: "cntr",
        title: t("每 20GP 约装"),
        width: 130,
        align: "right",
        sort: (a, b) => a.perContainer - b.perContainer,
        tip: t("按 28 立方可用容积估算，报价时最常被问的那个数"),
        render: (r) => <span className="cell-num">{formatInt(r.perContainer)}</span>,
      },
      { key: "gw", title: t("箱毛重"), width: 100, align: "right", render: (r) => <span className="cell-num">{(r.grossWeightG / 1000).toFixed(1)} kg</span> },
      { key: "onorder", title: t("在手采购"), width: 130, align: "right", sort: (a, b) => a.onOrderAmount - b.onOrderAmount, render: (r) => (r.onOrderAmount ? <><div className="cell-num">{formatMoney(r.onOrderAmount, "¥")}</div><div className="cell-sub" style={{ justifyContent: "flex-end" }}><span>{formatInt(r.onOrderQty)} {r.unit}</span></div></> : <span className="muted">—</span>) },
    ],
    [t, lang],
  );

  return (
    <Page
      title={t("产品管理")}
      desc={t("产品主档 · HS 编码与退税率挂这里，报关和退税计算直接取")}
      kpis={
        <>
          <Kpi icon="box" k={t("在册产品")} v={String(db.ops.products.length)} s={t("{n} 个品类", { n: cats.length })} />
          <Kpi icon="tag" k={t("平均退税率")} v={formatPct(db.ops.products.reduce((s, p) => s + p.refundRateBp / 100, 0) / (db.ops.products.length || 1), 1)} s={t("按 HS 编码归集")} />
          <Kpi icon="cart" k={t("在手采购额")} v={formatCompact(rows.reduce((s, r) => s + r.onOrderAmount, 0), "¥")} s={t("未关闭的采购合同")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜 SKU / 品名 / HS 编码…")} />
          <Segmented value={cat} onChange={(v) => set({ cat: v })} options={[{ value: "", label: t("全部") }, ...cats.map((c) => ({ value: c, label: c }))]} label={t("品类")} />
        </>
      }
    >
      <DataGrid<ProductRow>
        gridId="products"
        exportName={t("产品")}
        rows={rows}
        columns={columns}
        empty={<EmptyState icon="box" title={t("没有匹配的产品")} desc={t("换个关键词试试，或者清空搜索。")} />}
        renderCard={(r) => (
          <div className="rcard" key={r.id}>
            <div className="rcard-top">
              <span className="cell-main">{r.sku}</span>
              <span className="spacer" />
              <Pill tone="jade" dot={false}>{formatPct(r.refundRate, 0)}</Pill>
            </div>
            <div className="rcard-note">{r.name}</div>
            <div className="rcard-meta"><span className="num">HS {r.hsCode}</span><span>{r.category}</span></div>
            <div className="rcard-kv">
              <div><span>{t("最近采购价")}</span><b>{formatMoney(r.lastCost, "¥")}</b></div>
              <div><span>{t("每 20GP 约装")}</span><b>{formatInt(r.perContainer)}</b></div>
            </div>
          </div>
        )}
      />
    </Page>
  );
}

/* ═══════════════════ 询价单 ═══════════════════ */

export function Rfqs() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const status = get("status");
  const rows = useMemo(() => listRfqs(db, q, status), [db, q, status]);
  const [open, setOpen] = useState<RfqRow | null>(null);

  const columns: Column<RfqRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("询价单号"),
        width: 160,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.rfqNo.localeCompare(b.rfqNo),
        render: (r) => (
          <>
            <div className="cell-main">{r.rfqNo}</div>
            <div className="cell-sub"><span className="num">{r.createdAt}</span><span>· {r.ownerName}</span></div>
          </>
        ),
      },
      { key: "product", title: t("产品"), width: 210, render: (r) => (<><div className="truncate">{r.productName}</div><div className="cell-sub"><span className="num">{r.productSku}</span></div></>) },
      { key: "qty", title: t("询价数量"), width: 120, align: "right", sort: (a, b) => a.qty - b.qty, render: (r) => <span className="cell-num">{formatInt(r.qty)} <span className="muted">{r.unit}</span></span> },
      { key: "quotes", title: t("已报价"), width: 96, align: "right", sort: (a, b) => a.quoteCount - b.quoteCount, render: (r) => <span className="cell-num">{r.quoteCount} {t("家")}</span> },
      {
        key: "range",
        title: t("报价区间"),
        width: 160,
        align: "right",
        sort: (a, b) => a.lowest - b.lowest,
        tip: t("最低价与最高价的差距越大，越值得再谈一轮"),
        render: (r) =>
          r.quoteCount ? (
            <>
              <div className="cell-num">{formatMoney(r.lowest, "¥")} – {formatMoney(r.highest, "¥")}</div>
              <div className="cell-sub" style={{ justifyContent: "flex-end" }}>
                <span>{t("价差 {p}", { p: formatPct(r.lowest > 0 ? ((r.highest - r.lowest) / r.lowest) * 100 : 0, 0) })}</span>
              </div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "awarded",
        title: t("定标"),
        width: 190,
        render: (r) =>
          r.awardedTo ? (
            <>
              <div className="truncate">{r.awardedTo}</div>
              <div className="cell-sub">
                <span className="num">{formatMoney(r.awardedPrice ?? 0, "¥")}</span>
                {r.premium && r.premium > 0 ? <span style={{ color: "var(--amber)" }}>· {t("高于最低价 {v}", { v: formatMoney(r.premium, "¥") })}</span> : null}
              </div>
            </>
          ) : (
            <span className="muted">{t("未定标")}</span>
          ),
      },
      { key: "wanted", title: t("期望交期"), width: 116, sort: (a, b) => (a.wantedBy ?? "").localeCompare(b.wantedBy ?? ""), render: (r) => <span className="num">{r.wantedBy ?? "—"}</span> },
      { key: "status", title: t("状态"), width: 100, render: (r) => <Pill tone={r.status === "closed" ? "jade" : r.status === "quoted" ? "accent" : "amber"}>{t(RFQ_STATUS[r.status] ?? r.status)}</Pill> },
    ],
    [t],
  );

  return (
    <Page
      title={t("询价单")}
      desc={t("一次询多家供应商，横向比价后定标 · 定标价高于最低价时会标出多花了多少")}
      kpis={
        <>
          <Kpi icon="search" k={t("询价单")} v={String(db.ops.rfqs.length)} s={t("累计发起")} />
          <Kpi icon="clock" k={t("待定标")} v={String(db.ops.rfqs.filter((r) => r.status !== "closed").length)} s={t("已收到报价等决策")} tone="amber" />
          <Kpi icon="target" k={t("平均比价家数")} v={(db.ops.rfqQuotes.length / (db.ops.rfqs.length || 1)).toFixed(1)} s={t("低于 3 家议价空间有限")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜询价单号 / 产品 / 供应商…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[{ value: "", label: t("全部") }, ...Object.entries(RFQ_STATUS).map(([k, v]) => ({ value: k, label: t(v) }))]}
            label={t("状态")}
          />
        </>
      }
    >
      <DataGrid<RfqRow>
        gridId="rfqs"
        exportName={t("询价单")}
        rows={rows}
        columns={columns}
        onRowOpen={setOpen}
        rowTone={(r) => (r.status !== "closed" && r.quoteCount >= 3 ? "amber" : undefined)}
        empty={<EmptyState icon="search" title={t("没有匹配的询价单")} desc={t("换个关键词或状态试试。")} />}
        renderCard={(r) => (
          <button className="rcard" key={r.id} onClick={() => setOpen(r)}>
            <div className="rcard-top">
              <span className="cell-main">{r.rfqNo}</span>
              <span className="spacer" />
              <Pill tone={r.status === "closed" ? "jade" : "accent"}>{t(RFQ_STATUS[r.status] ?? r.status)}</Pill>
            </div>
            <div className="rcard-note">{r.productName}</div>
            <div className="rcard-kv">
              <div><span>{t("询价数量")}</span><b>{formatInt(r.qty)}</b></div>
              <div><span>{t("已报价")}</span><b>{r.quoteCount}</b></div>
              <div><span>{t("最低价")}</span><b>{formatMoney(r.lowest, "¥")}</b></div>
            </div>
          </button>
        )}
      />

      {open ? <RfqDrawer row={open} onClose={() => setOpen(null)} /> : null}
    </Page>
  );
}

/** 比价表：一屏之内把「便宜 / 快 / 靠谱」三件事摆在一起 */
function RfqDrawer({ row, onClose }: { row: RfqRow; onClose: () => void }) {
  const db = useDb();
  const { t } = useT();
  const quotes = useMemo(() => getRfqQuotes(db, row.id), [db, row.id]);
  const best = quotes[0];

  return (
    <Drawer
      open
      onClose={onClose}
      storageKey="tw.drawer.rfq.w"
      title={<>{row.rfqNo}<Pill tone={row.status === "closed" ? "jade" : "accent"}>{t(RFQ_STATUS[row.status] ?? row.status)}</Pill></>}
      subtitle={<span>{row.productName} · {formatInt(row.qty)} {row.unit} · {t("期望交期")} {row.wantedBy ?? "—"}</span>}
    >
      <div className="sect">
        <div className="sect-h">
          <Icon name="target" size={14} />
          {t("比价")}
          <span className="spacer" />
          <span className="muted" style={{ fontWeight: 400 }}>{t("按单价从低到高")}</span>
        </div>
        <div className="quotes">
          {quotes.map((qt) => (
            <div className="quote" key={qt.id} data-awarded={qt.awarded ? "1" : "0"} data-best={qt.id === best?.id ? "1" : "0"}>
              <div className="quote-top">
                <b className="truncate">{qt.supplierName}</b>
                {qt.awarded ? <Pill tone="jade">{t("已定标")}</Pill> : qt.id === best?.id ? <Pill tone="accent">{t("最低价")}</Pill> : null}
                <span className="spacer" />
                <span className="quote-price">{formatMoney(qt.unitPrice, "¥")}</span>
              </div>
              <div className="quote-meta">
                <span>{t("总价")} <b className="num">{formatMoney(qt.total, "¥")}</b></span>
                <span>{t("交期")} <b className="num">{qt.leadDays} {t("天")}</b></span>
                <span>{t("起订")} <b className="num">{formatInt(qt.moq)}</b></span>
                <span>{t("账期")} <b className="num">{qt.termDays} {t("天")}</b></span>
                <span>{t("评分")} <b className="num">{qt.score}</b></span>
              </div>
              {qt.validUntil ? <div className="quote-valid">{t("报价有效期至 {d}", { d: qt.validUntil })}</div> : null}
            </div>
          ))}
        </div>
      </div>

      {row.premium !== null && row.premium > 0 ? (
        <div className="sect">
          <div style={{ display: "flex", gap: 10, padding: 12, background: "var(--amber-soft)", borderRadius: "var(--r-md)", color: "var(--amber)", fontSize: "var(--fs-md)", lineHeight: 1.6 }}>
            <Icon name="info" size={16} style={{ marginTop: 2, flex: "none" }} />
            <span>{t("这次定标比最低价多花了 {v} —— 如果是为了交期或品质，把理由写进备注，下次复盘才说得清。", { v: formatMoney(row.premium, "¥") })}</span>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

/* ═══════════════════ 采购合同 ═══════════════════ */

export function Contracts() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const status = get("status");
  const rows = useMemo(() => listContracts(db, { q, status }), [db, q, status]);
  const all = useMemo(() => listContracts(db), [db]);

  const columns: Column<ContractRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("合同号"),
        width: 160,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.contractNo.localeCompare(b.contractNo),
        render: (r) => (
          <>
            <div className="cell-main">{r.contractNo}</div>
            <div className="cell-sub"><span className="num">{r.signedOn}</span></div>
          </>
        ),
      },
      { key: "supplier", title: t("供应商"), width: 230, sort: (a, b) => a.supplierName.localeCompare(b.supplierName), render: (r) => <span className="truncate" style={{ display: "block" }}>{r.supplierName}</span> },
      { key: "pi", title: t("关联 PI"), width: 140, render: (r) => (r.piNo ? <Link to={`/orders?id=${r.piId}`} className="num">{r.piNo}</Link> : <span className="muted">{t("备货单")}</span>) },
      { key: "product", title: t("产品"), width: 190, render: (r) => (<><div className="truncate">{r.productName}</div><div className="cell-sub"><span>{formatInt(r.qty)} {r.unit} × {formatMoney(r.unitPrice, "¥")}</span></div></>) },
      { key: "amount", title: t("合同金额"), width: 130, align: "right", sort: (a, b) => a.amount - b.amount, render: (r) => <span className="cell-num">{formatMoney(r.amount, "¥")}</span> },
      {
        key: "paid",
        title: t("付款进度"),
        width: 150,
        align: "right",
        sort: (a, b) => a.paidRatio - b.paidRatio,
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <span className="cell-num">{formatPct(r.paidRatio * 100, 0)}</span>
            <div style={{ width: 84 }}><Bar value={r.paid} max={r.amount} tone={r.paidRatio >= 1 ? "jade" : r.paidRatio > 0 ? "" : "amber"} /></div>
          </div>
        ),
      },
      { key: "unpaid", title: t("未付"), width: 126, align: "right", sort: (a, b) => a.unpaid - b.unpaid, render: (r) => <span className="cell-num" style={{ color: r.unpaid > 0 ? "var(--amber)" : "var(--text-3)" }}>{r.unpaid > 0 ? formatMoney(r.unpaid, "¥") : "—"}</span> },
      { key: "terms", title: t("付款条件"), width: 190, render: (r) => <span className="truncate muted" style={{ display: "block", fontSize: "var(--fs-sm)" }}>{r.terms}</span> },
      {
        key: "delivery",
        title: t("交货日"),
        width: 140,
        sort: (a, b) => (a.deliveryBy ?? "").localeCompare(b.deliveryBy ?? ""),
        render: (r) => (
          <>
            <div className="num">{r.deliveryBy ?? "—"}</div>
            {r.daysToDelivery !== null && r.status !== "closed" ? (
              <div className="cell-sub">
                {r.daysToDelivery < 0 ? <Pill tone="coral">{t("已过期 {n} 天", { n: -r.daysToDelivery })}</Pill> : <span>{t("还有 {n} 天", { n: r.daysToDelivery })}</span>}
              </div>
            ) : null}
          </>
        ),
      },
      { key: "status", title: t("状态"), width: 100, render: (r) => <Pill tone={r.status === "closed" ? "mute" : r.status === "executing" ? "accent" : r.status === "signed" ? "jade" : "amber"}>{t(CONTRACT_STATUS[r.status] ?? r.status)}</Pill> },
    ],
    [t],
  );

  const unpaidTotal = all.reduce((s, r) => s + r.unpaid, 0);

  return (
    <Page
      title={t("采购合同")}
      desc={t("合同条款、付款节奏与实际付款的对账 · 付款进度直接读收付款流水")}
      kpis={
        <>
          <Kpi icon="file" k={t("在执行合同")} v={String(all.filter((c) => c.status === "executing" || c.status === "signed").length)} s={t("共 {n} 份", { n: all.length })} />
          <Kpi icon="wallet" k={t("合同总额")} v={formatCompact(all.reduce((s, r) => s + r.amount, 0), "¥")} s={t("含已关闭")} />
          <Kpi icon="alert" k={t("未付余额")} v={formatCompact(unpaidTotal, "¥")} s={t("按合同金额减已付")} tone={unpaidTotal > 0 ? "amber" : undefined} />
          <Kpi icon="clock" k={t("交期已过")} v={String(all.filter((c) => c.status !== "closed" && (c.daysToDelivery ?? 1) < 0).length)} s={t("合同交货日已过还没关闭")} tone="coral" />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜合同号 / 供应商 / 产品 / PI…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[{ value: "", label: t("全部") }, ...Object.entries(CONTRACT_STATUS).map(([k, v]) => ({ value: k, label: t(v) }))]}
            label={t("状态")}
          />
        </>
      }
    >
      <DataGrid<ContractRow>
        gridId="contracts"
        exportName={t("采购合同")}
        rows={rows}
        columns={columns}
        rowTone={(r) => (r.status !== "closed" && (r.daysToDelivery ?? 1) < 0 ? "coral" : r.unpaid > 0 && r.status === "executing" ? "amber" : undefined)}
        empty={<EmptyState icon="file" title={t("没有匹配的合同")} desc={t("换个关键词或状态试试。")} />}
        renderCard={(r) => (
          <div className="rcard" key={r.id}>
            <div className="rcard-top">
              <span className="cell-main">{r.contractNo}</span>
              <span className="spacer" />
              <Pill tone={r.status === "executing" ? "accent" : "jade"}>{t(CONTRACT_STATUS[r.status] ?? r.status)}</Pill>
            </div>
            <div className="rcard-note">{r.supplierName} · {r.productName}</div>
            <div className="rcard-kv">
              <div><span>{t("合同金额")}</span><b>{formatMoney(r.amount, "¥")}</b></div>
              <div><span>{t("未付")}</span><b>{formatMoney(r.unpaid, "¥")}</b></div>
              <div><span>{t("交货日")}</span><b>{r.deliveryBy ?? "—"}</b></div>
            </div>
          </div>
        )}
      />
    </Page>
  );
}

/* ═══════════════════ 生产单 ═══════════════════ */

export function Productions() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const status = get("status");
  const rows = useMemo(() => listProductions(db, { q, status }), [db, q, status]);
  const all = useMemo(() => listProductions(db), [db]);
  const late = all.filter((p) => p.late);

  const columns: Column<ProductionRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("生产单号"),
        width: 158,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.orderNo.localeCompare(b.orderNo),
        render: (r) => (
          <>
            <div className="cell-main">{r.orderNo}</div>
            <div className="cell-sub">{r.piNo ? <span className="num">{r.piNo}</span> : <span>{t("备货单")}</span>}</div>
          </>
        ),
      },
      { key: "supplier", title: t("工厂"), width: 220, sort: (a, b) => a.supplierName.localeCompare(b.supplierName), render: (r) => <span className="truncate" style={{ display: "block" }}>{r.supplierName}</span> },
      { key: "product", title: t("产品"), width: 190, render: (r) => <span className="truncate" style={{ display: "block" }}>{r.productName}</span> },
      {
        key: "progress",
        title: t("排产进度"),
        width: 180,
        align: "right",
        sort: (a, b) => a.progress - b.progress,
        render: (r) => (
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <span className="cell-num">
              {formatInt(r.doneQty)} / {formatInt(r.qty)} <span className="muted">{r.unit}</span>
            </span>
            <div style={{ width: 100 }}>
              <Bar value={r.doneQty} max={r.qty} tone={r.late ? "coral" : r.progress >= 1 ? "jade" : ""} />
            </div>
          </div>
        ),
      },
      {
        key: "due",
        title: t("交期"),
        width: 140,
        sort: (a, b) => a.dueOn.localeCompare(b.dueOn),
        tip: t("按交期从近到远排"),
        render: (r) => (
          <>
            <div className="num">{r.dueOn}</div>
            <div className="cell-sub">
              {r.status === "done" ? (
                <span>{t("已完工")}</span>
              ) : r.daysLeft < 0 ? (
                <Pill tone="coral">{t("超期 {n} 天", { n: -r.daysLeft })}</Pill>
              ) : r.daysLeft <= 7 ? (
                <Pill tone="amber">{t("还有 {n} 天", { n: r.daysLeft })}</Pill>
              ) : (
                <span>{t("还有 {n} 天", { n: r.daysLeft })}</span>
              )}
            </div>
          </>
        ),
      },
      {
        key: "qc",
        title: t("验货"),
        width: 100,
        render: (r) =>
          r.qcResult === "pass" ? <Pill tone="jade">{t("合格")}</Pill> : r.qcResult === "fail" ? <Pill tone="coral">{t("不合格")}</Pill> : <span className="muted">{t("未验")}</span>,
      },
      { key: "status", title: t("状态"), width: 106, render: (r) => <Pill tone={r.late ? "coral" : r.status === "done" ? "jade" : r.status === "inspecting" ? "violet" : r.status === "producing" ? "accent" : "mute"}>{t(PRODUCTION_STATUS[r.status] ?? r.status)}</Pill> },
      { key: "note", title: t("备注"), width: 240, render: (r) => <span className="truncate muted" style={{ display: "block", fontSize: "var(--fs-sm)" }}>{r.note ?? "—"}</span> },
    ],
    [t],
  );

  return (
    <Page
      title={t("生产单")}
      desc={t("下给工厂的生产指令 · 按交期从近到远排，超期的排在最前面并标红")}
      kpis={
        <>
          <Kpi icon="play" k={t("在产")} v={String(all.filter((p) => p.status === "producing").length)} s={t("工厂已开工")} />
          <Kpi icon="alert" k={t("已超期")} v={String(late.length)} s={late.length ? t("最久超期 {n} 天", { n: Math.max(...late.map((p) => -p.daysLeft)) }) : t("没有超期的单")} tone={late.length ? "coral" : undefined} />
          <Kpi icon="clock" k={t("7 天内到期")} v={String(all.filter((p) => !p.late && p.status !== "done" && p.daysLeft <= 7).length)} s={t("该催工厂了")} tone="amber" />
          <Kpi icon="check" k={t("待验货")} v={String(all.filter((p) => p.status === "inspecting").length)} s={t("已完工等 QC")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜生产单号 / 工厂 / 产品 / PI…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ status: v })}
            options={[{ value: "", label: t("全部") }, ...Object.entries(PRODUCTION_STATUS).map(([k, v]) => ({ value: k, label: t(v) }))]}
            label={t("状态")}
          />
        </>
      }
    >
      <DataGrid<ProductionRow>
        gridId="productions"
        exportName={t("生产单")}
        rows={rows}
        columns={columns}
        rowTone={(r) => (r.late ? "coral" : r.status !== "done" && r.daysLeft <= 7 ? "amber" : undefined)}
        empty={<EmptyState icon="play" title={t("没有匹配的生产单")} desc={t("换个关键词或状态试试。")} />}
        renderCard={(r) => (
          <div className="rcard" key={r.id} data-tone={r.late ? "coral" : undefined}>
            <div className="rcard-top">
              <span className="cell-main">{r.orderNo}</span>
              <span className="spacer" />
              <Pill tone={r.late ? "coral" : r.status === "done" ? "jade" : "accent"}>{t(PRODUCTION_STATUS[r.status] ?? r.status)}</Pill>
            </div>
            <div className="rcard-note">{r.supplierName} · {r.productName}</div>
            <div className="rcard-kv">
              <div><span>{t("排产进度")}</span><b>{formatPct(r.progress * 100, 0)}</b></div>
              <div><span>{t("交期")}</span><b>{r.dueOn}</b></div>
            </div>
          </div>
        )}
      />
    </Page>
  );
}

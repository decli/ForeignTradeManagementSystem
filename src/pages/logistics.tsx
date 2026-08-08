/**
 * 库存 / 运费询价 / 单证备案。
 *
 * 这三件事都发生在「货已经有了、还没到客户手上」这一段，出问题的方式也很像：
 * 不是算错，是**漏了**。所以三页的重点都放在「缺什么」上：
 *
 *   库存   → 可用量是多少（不是账面量）、哪些快过期了
 *   运费   → 哪条航线的报价过期了，还在拿它核成本
 *   单证   → 这一票缺哪几份，会不会卡在目的港
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Drawer } from "@/components/ui/Drawer";
import { Kpi, Page, useParam } from "@/components/ui/PageKit";
import { Bar, EmptyState, KV, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { DOC_KINDS, DOC_STATUS, FORM_BY_COUNTRY, FREIGHT_STATUS } from "@/data/ops-types";
import { useT } from "@/i18n";
import { centsToYuan, daysBetween, formatCny, formatInt, formatMoney, formatPct, todayIso } from "@/lib/format";
import type { Tone } from "@/lib/rules";
import { exportXlsx, stampName } from "@/lib/xlsx";

/* ═══════════════════ 库存管理 ═══════════════════ */

export function Inventory() {
  const db = useDb();
  const { t, lang } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const wh = get("wh");
  const view = get("view");
  const today = todayIso();

  const rows = useMemo(() => {
    const prdById = new Map(db.ops.products.map((p) => [p.id, p]));
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const key = q.trim().toLowerCase();
    return db.ops.stock
      .map((s) => {
        const p = prdById.get(s.productId);
        const pi = s.lockedPiId ? piById.get(s.lockedPiId) : undefined;
        const ageDays = daysBetween(today, s.inboundOn);
        const expiryDays = s.expiryOn ? daysBetween(s.expiryOn, today) : null;
        return {
          id: s.id,
          sku: p?.sku ?? "—",
          name: (lang === "en" ? p?.nameEn : p?.name) ?? p?.name ?? "—",
          category: p?.category ?? "—",
          unit: p?.unit ?? "",
          warehouse: s.warehouse,
          lotNo: s.lotNo,
          qty: s.qty,
          locked: s.lockedQty,
          /* 可用量才是业务问的那个数。账面 8 万件、锁了 5 万给别的单，
             再答应客户 6 万就是超卖 —— 这一列不给，销售就只能打电话问仓库。 */
          free: s.qty - s.lockedQty,
          lockedPi: pi?.piNo ?? null,
          inboundOn: s.inboundOn,
          ageDays,
          expiryOn: s.expiryOn,
          expiryDays,
          value: centsToYuan((p?.lastCostCents ?? 0) * s.qty),
        };
      })
      .filter((r) => !wh || r.warehouse === wh)
      .filter((r) => (view === "slow" ? r.ageDays > 120 : view === "expiring" ? r.expiryDays !== null && r.expiryDays < 180 : true))
      .filter((r) => !key || `${r.sku} ${r.name} ${r.lotNo} ${r.lockedPi ?? ""}`.toLowerCase().includes(key))
      .sort((a, b) => b.value - a.value);
  }, [db, q, wh, view, lang, today]);

  const [open, setOpen] = useState<(typeof rows)[number] | null>(null);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const slow = rows.filter((r) => r.ageDays > 120);
  const expiring = rows.filter((r) => r.expiryDays !== null && r.expiryDays < 180);

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "sku",
        title: t("产品"),
        width: 250,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.sku.localeCompare(b.sku),
        render: (r) => (
          <>
            <div className="cell-main truncate">{r.name}</div>
            <div className="cell-sub">
              <span className="num">{r.sku}</span> · {r.category}
            </div>
          </>
        ),
      },
      { key: "wh", title: t("仓库"), width: 120, render: (r) => <span className="muted">{r.warehouse}</span> },
      { key: "lot", title: t("批号"), width: 110, render: (r) => <span className="num">{r.lotNo}</span> },
      {
        key: "qty",
        title: t("账面数量"),
        width: 120,
        align: "right",
        sort: (a, b) => a.qty - b.qty,
        render: (r) => <span className="cell-num">{formatInt(r.qty)}</span>,
      },
      {
        key: "locked",
        title: t("已锁定"),
        width: 130,
        align: "right",
        tip: t("被在跟 PI 占用的数量，不能再答应给别的客户"),
        sort: (a, b) => a.locked - b.locked,
        render: (r) =>
          r.locked ? (
            <span className="cell-num" style={{ color: "var(--amber)" }}>
              {formatInt(r.locked)}
            </span>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "free",
        title: t("可用量"),
        width: 130,
        align: "right",
        tip: t("账面数量 − 已锁定。答应客户之前看这一列"),
        sort: (a, b) => a.free - b.free,
        render: (r) => (
          <span className="cell-num strong" style={{ color: r.free <= 0 ? "var(--coral)" : undefined }}>
            {formatInt(r.free)}
          </span>
        ),
      },
      {
        key: "pi",
        title: t("锁给"),
        width: 150,
        render: (r) =>
          r.lockedPi ? (
            <Link className="num link" to={`/orders?q=${encodeURIComponent(r.lockedPi)}`}>
              {r.lockedPi}
            </Link>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "age",
        title: t("库龄"),
        width: 118,
        align: "right",
        sort: (a, b) => a.ageDays - b.ageDays,
        render: (r) => (
          <span className="cell-num" style={{ color: r.ageDays > 180 ? "var(--coral)" : r.ageDays > 120 ? "var(--amber)" : undefined }}>
            {r.ageDays} {t("天")}
          </span>
        ),
      },
      {
        key: "expiry",
        title: t("有效期"),
        width: 170,
        tip: t("防护用品与医疗器械都有有效期，过期只能报废"),
        sort: (a, b) => (a.expiryDays ?? 9999) - (b.expiryDays ?? 9999),
        render: (r) =>
          r.expiryOn ? (
            <>
              <div className="num">{r.expiryOn}</div>
              <div className="cell-sub">
                {r.expiryDays !== null && r.expiryDays < 0
                  ? t("已过期")
                  : t("还剩 {n} 天", { n: r.expiryDays ?? 0 })}
              </div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "value",
        title: t("库存金额"),
        width: 130,
        align: "right",
        sort: (a, b) => a.value - b.value,
        render: (r) => <span className="cell-num">{formatCny(r.value)}</span>,
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("库存管理")}
      desc={t("现货与备货库存。可用量、锁库归属、库龄与有效期都在一张表上")}
      kpis={
        <>
          <Kpi icon="box" k={t("库存金额")} v={formatCny(totalValue)} s={t("{n} 个批次", { n: rows.length })} />
          <Kpi
            icon="lock"
            k={t("已锁定")}
            v={formatInt(rows.reduce((s, r) => s + r.locked, 0))}
            s={t("被在跟订单占用")}
            tone="amber"
          />
          <Kpi
            icon="clock"
            k={t("库龄超 120 天")}
            v={formatInt(slow.length)}
            s={t("呆滞，建议清")}
            tone={slow.length ? "amber" : "jade"}
          />
          <Kpi
            icon="alert"
            k={t("半年内到期")}
            v={formatInt(expiring.length)}
            s={t("到期只能报废")}
            tone={expiring.length ? "coral" : "jade"}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜 SKU / 产品 / 批号 / PI…")} />
          <Segmented
            value={wh}
            onChange={(v) => set({ wh: v })}
            options={[
              { value: "", label: t("全部仓库") },
              ...[...new Set(db.ops.stock.map((s) => s.warehouse))].map((w) => ({ value: w, label: w })),
            ]}
          />
          <Segmented
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "slow", label: t("呆滞"), count: slow.length },
              { value: "expiring", label: t("临期"), count: expiring.length },
            ]}
          />
        </>
      }
    >
      <DataGrid
        gridId="stock"
        onExport={() =>
          exportXlsx(
            stampName("库存"),
            [
              { header: "SKU", width: 16, value: (r: (typeof rows)[number]) => r.sku },
              { header: t("产品"), width: 28, value: (r: (typeof rows)[number]) => r.name },
              { header: t("仓库"), width: 14, value: (r: (typeof rows)[number]) => r.warehouse },
              { header: t("批号"), width: 12, value: (r: (typeof rows)[number]) => r.lotNo },
              { header: t("账面数量"), width: 12, type: "number", value: (r: (typeof rows)[number]) => r.qty },
              { header: t("已锁定"), width: 12, type: "number", value: (r: (typeof rows)[number]) => r.locked },
              { header: t("可用量"), width: 12, type: "number", value: (r: (typeof rows)[number]) => r.free },
              { header: t("有效期"), width: 12, value: (r: (typeof rows)[number]) => r.expiryOn ?? "" },
            ],
            rows,
          )
        }
        rows={rows}
        columns={columns}
        onRowOpen={setOpen}
        getRowLabel={(r) => `${r.sku} ${r.lotNo}`}
        rowTone={(r) => (r.expiryDays !== null && r.expiryDays < 90 ? "coral" : r.ageDays > 120 ? "amber" : undefined)}
        empty={<EmptyState icon="box" title={t("没有匹配的库存批次")} desc={t("换个筛选条件试试")} />}
      />

      <Drawer open={!!open} title={open?.name ?? ""} subtitle={open ? `${open.sku} · ${open.lotNo}` : ""} onClose={() => setOpen(null)}>
        {open ? (
          <div className="sect">
            <div className="sect-h">
              <Icon name="box" size={14} />
              {t("批次")}
            </div>
            <div className="kv-grid">
              <KV k={t("仓库")} v={open.warehouse} />
              <KV k={t("批号")} v={open.lotNo} mono />
              <KV k={t("入库日期")} v={open.inboundOn} mono />
              <KV k={t("库龄")} v={t("{n} 天", { n: open.ageDays })} />
              <KV k={t("有效期")} v={open.expiryOn ?? "—"} mono />
              <KV k={t("账面数量")} v={`${formatInt(open.qty)} ${open.unit}`} mono />
              <KV k={t("已锁定")} v={open.locked ? `${formatInt(open.locked)} ${open.unit}` : "—"} mono />
              <KV k={t("可用量")} v={`${formatInt(open.free)} ${open.unit}`} mono />
              <KV
                k={t("锁给")}
                v={
                  open.lockedPi ? (
                    <Link className="num link" to={`/orders?q=${encodeURIComponent(open.lockedPi)}`}>
                      {open.lockedPi}
                    </Link>
                  ) : (
                    <span className="muted">{t("未锁库")}</span>
                  )
                }
              />
              <KV k={t("库存金额")} v={formatCny(open.value)} mono />
            </div>
          </div>
        ) : null}
      </Drawer>
    </Page>
  );
}

/* ═══════════════════ 运费询价 ═══════════════════ */

const LANE_TONE: Record<string, Tone> = { open: "amber", quoted: "accent", booked: "jade" };

export function Freight() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const status = get("st");
  const today = todayIso();

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    return db.ops.lanes
      .map((l) => {
        const qs = db.ops.freightQuotes.filter((x) => x.laneId === l.id);
        const air = l.mode === "空运";
        const priceOf = (x: (typeof qs)[number]) => (air ? x.perKgCents : x.price20Cents);
        const prices = qs.map(priceOf).filter((x) => x > 0);
        const lo = prices.length ? Math.min(...prices) : 0;
        const hi = prices.length ? Math.max(...prices) : 0;
        const awarded = qs.find((x) => x.id === l.awardedQuoteId) ?? null;
        /* 有效期是运价的命门：一个月前的报价拿去核今天的成本，
           算出来的利润率是假的。所以过期与否要在列表上直接看得见。 */
        const liveQs = qs.filter((x) => x.validUntil >= today);
        return {
          id: l.id,
          laneNo: l.laneNo,
          lane: `${l.pol} → ${l.pod}`,
          pol: l.pol,
          pod: l.pod,
          country: l.country,
          mode: l.mode,
          air,
          askedOn: l.askedOn,
          status: l.status,
          quotes: qs,
          quoteCount: qs.length,
          liveCount: liveQs.length,
          expired: qs.length - liveQs.length,
          lo: centsToYuan(lo),
          hi: centsToYuan(hi),
          spread: lo > 0 ? ((hi - lo) / lo) * 100 : 0,
          awarded,
          awardedPrice: awarded ? centsToYuan(priceOf(awarded)) : 0,
          fastest: qs.length ? Math.min(...qs.map((x) => x.transitDays)) : 0,
        };
      })
      .filter((r) => !status || r.status === status)
      .filter((r) => !key || `${r.laneNo} ${r.lane} ${r.country}`.toLowerCase().includes(key))
      .sort((a, b) => b.askedOn.localeCompare(a.askedOn));
  }, [db, q, status, today]);

  const [open, setOpen] = useState<(typeof rows)[number] | null>(null);
  const staleCount = rows.filter((r) => r.expired > 0).length;

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "lane",
        title: t("航线"),
        width: 240,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.lane.localeCompare(b.lane),
        render: (r) => (
          <>
            <div className="cell-main truncate">{r.lane}</div>
            <div className="cell-sub">
              <span className="num">{r.laneNo}</span> · {r.country}
            </div>
          </>
        ),
      },
      { key: "mode", title: t("方式"), width: 84, render: (r) => <Pill tone={r.air ? "violet" : "accent"}>{r.mode}</Pill> },
      {
        key: "range",
        title: t("报价区间"),
        width: 190,
        tip: t("整柜看 20GP，空运看每公斤"),
        sort: (a, b) => a.lo - b.lo,
        render: (r) =>
          r.lo ? (
            <>
              <div className="num">
                {formatMoney(r.lo, "$")} – {formatMoney(r.hi, "$")}
              </div>
              <div className="cell-sub">{r.air ? t("每公斤") : t("每 20GP")}</div>
            </>
          ) : (
            <span className="muted">{t("暂无报价")}</span>
          ),
      },
      {
        key: "spread",
        title: t("价差"),
        width: 92,
        align: "right",
        tip: t("最高价比最低价贵多少。价差大说明值得多问一家"),
        sort: (a, b) => a.spread - b.spread,
        render: (r) => (
          <span className="cell-num" style={{ color: r.spread > 20 ? "var(--amber)" : undefined }}>
            {r.spread ? formatPct(r.spread, 0) : "—"}
          </span>
        ),
      },
      {
        key: "transit",
        title: t("最快航程"),
        width: 110,
        align: "right",
        sort: (a, b) => a.fastest - b.fastest,
        render: (r) => <span className="cell-num">{r.fastest ? `${r.fastest} ${t("天")}` : "—"}</span>,
      },
      {
        key: "quotes",
        title: t("有效报价"),
        width: 150,
        tip: t("过期的报价不能再拿去核算订单成本"),
        render: (r) => (
          <>
            <div>
              {r.liveCount} / {r.quoteCount}
            </div>
            {r.expired ? <div className="cell-sub" style={{ color: "var(--amber)" }}>{t("{n} 家已过期", { n: r.expired })}</div> : null}
          </>
        ),
      },
      {
        key: "awarded",
        title: t("中标"),
        width: 200,
        render: (r) =>
          r.awarded ? (
            <>
              <div className="cell-main truncate">{r.awarded.forwarder}</div>
              <div className="cell-sub num">{formatMoney(r.awardedPrice, "$")}</div>
            </>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: "st",
        title: t("状态"),
        width: 100,
        render: (r) => <Pill tone={LANE_TONE[r.status]}>{t(FREIGHT_STATUS[r.status] ?? r.status)}</Pill>,
      },
      { key: "asked", title: t("询价日"), width: 110, sort: (a, b) => a.askedOn.localeCompare(b.askedOn), render: (r) => <span className="num">{r.askedOn}</span> },
    ],
    [t],
  );

  return (
    <Page
      title={t("运费询价")}
      desc={t("按航线横向比价货代。中标价可直接带入订单成本 —— 前提是它还没过期")}
      kpis={
        <>
          <Kpi icon="ship" k={t("在询航线")} v={formatInt(rows.length)} s={t("覆盖 {n} 个国家", { n: new Set(rows.map((r) => r.country)).size })} />
          <Kpi icon="file" k={t("货代报价")} v={formatInt(rows.reduce((s, r) => s + r.quoteCount, 0))} s={t("累计收到")} />
          <Kpi
            icon="gauge"
            k={t("平均价差")}
            v={formatPct(rows.length ? rows.reduce((s, r) => s + r.spread, 0) / rows.length : 0, 0)}
            s={t("最高价 vs 最低价")}
          />
          <Kpi
            icon="alert"
            k={t("含过期报价")}
            v={formatInt(staleCount)}
            s={t("别再拿去核成本")}
            tone={staleCount ? "amber" : "jade"}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜航线 / 港口 / 国家…")} />
          <Segmented
            value={status}
            onChange={(v) => set({ st: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "open", label: t("询价中") },
              { value: "quoted", label: t("已报价") },
              { value: "booked", label: t("已订舱") },
            ]}
          />
        </>
      }
    >
      <DataGrid
        gridId="freight"
        exportName={t("运费询价")}
        rows={rows}
        columns={columns}
        onRowOpen={setOpen}
        getRowLabel={(r) => r.lane}
        rowTone={(r) => (r.expired > 0 ? "amber" : undefined)}
        empty={<EmptyState icon="ship" title={t("没有匹配的航线")} desc={t("换个筛选条件试试")} />}
      />

      <Drawer open={!!open} title={open?.lane ?? ""} subtitle={open ? `${open.laneNo} · ${open.mode}` : ""} onClose={() => setOpen(null)}>
        {open ? (
          <div className="sect">
            <div className="sect-h">
              <Icon name="ship" size={14} />
              {t("货代比价")}
              <span className="spacer" />
              <span className="muted">{t("按综合分排序")}</span>
            </div>
            <div className="quotes">
              {[...open.quotes]
                .sort((a, b) => (open.air ? a.perKgCents - b.perKgCents : a.price20Cents - b.price20Cents))
                .map((x) => {
                  const live = x.validUntil >= today;
                  const won = x.id === open.awarded?.id;
                  return (
                    <div key={x.id} className="quote" data-won={won ? "1" : undefined} data-stale={live ? undefined : "1"}>
                      <div className="quote-top">
                        <b className="truncate">{x.forwarder}</b>
                        {won ? <Pill tone="jade">{t("已订舱")}</Pill> : null}
                        {live ? null : <Pill tone="amber">{t("已过期")}</Pill>}
                        <span className="spacer" />
                        <span className="quote-price">
                          {open.air
                            ? `${formatMoney(centsToYuan(x.perKgCents), "$")} / kg`
                            : formatMoney(centsToYuan(x.price20Cents), "$")}
                        </span>
                      </div>
                      <div className="quote-meta">
                        {open.air ? null : (
                          <span>
                            40HQ {formatMoney(centsToYuan(x.price40Cents), "$")}
                          </span>
                        )}
                        <span>
                          {t("航程")} {x.transitDays} {t("天")}
                        </span>
                        <span>
                          {t("班期")} {t("每周 {n} 班", { n: x.sailings })}
                        </span>
                      </div>
                      <div className="quote-valid">
                        {t("有效期至")} {x.validUntil}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}
      </Drawer>
    </Page>
  );
}

/* ═══════════════════ 单证备案 ═══════════════════ */

export function Documents() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const view = get("view");

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    const custById = new Map(db.customers.map((c) => [c.id, c]));
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    return db.shipments
      .filter((s) => !s.archived)
      .map((s) => {
        const mine = db.ops.docs.filter((d) => d.shipmentId === s.id);
        const have = new Set(mine.map((d) => d.kind));
        /* 齐套 = 五份通用单证 + 目的国要求的那张优惠原产地证。
           少一张 FORM E，客户在目的港就得按普通税率交关税 ——
           所以「缺件」要按国家算，不能一刀切数够五份了事。 */
        const need: string[] = [...DOC_KINDS];
        const form = FORM_BY_COUNTRY[s.country];
        if (form) need.push(form);
        const missing = need.filter((k) => !have.has(k));
        const pending = mine.filter((d) => d.status === "pending").length;
        const pi = s.piId ? piById.get(s.piId) : undefined;
        const cust = pi ? custById.get(pi.customerId) : undefined;
        return {
          id: s.id,
          batchNo: s.batchNo,
          batchLabel: s.batchLabel,
          piNo: pi?.piNo ?? "—",
          customer: cust?.name ?? "—",
          country: s.country,
          form: form ?? null,
          releaseState: s.releaseState,
          need,
          docs: mine,
          have: need.length - missing.length,
          total: need.length,
          missing,
          pending,
          ready: missing.length === 0 && pending === 0,
        };
      })
      .filter((r) => (view === "gap" ? r.missing.length > 0 : view === "pending" ? r.pending > 0 : true))
      .filter((r) => !key || `${r.batchNo} ${r.piNo} ${r.customer} ${r.country}`.toLowerCase().includes(key))
      .sort((a, b) => b.missing.length - a.missing.length || a.batchNo.localeCompare(b.batchNo));
  }, [db, q, view]);

  const [open, setOpen] = useState<(typeof rows)[number] | null>(null);
  const gaps = rows.filter((r) => r.missing.length > 0);
  const pendings = rows.filter((r) => r.pending > 0);

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "batch",
        title: t("出运批次"),
        width: 220,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.batchNo.localeCompare(b.batchNo),
        render: (r) => (
          <>
            <div className="cell-main truncate">
              <span className="num">{r.batchNo}</span>
            </div>
            <div className="cell-sub truncate">
              {r.piNo} · {r.customer}
            </div>
          </>
        ),
      },
      { key: "country", title: t("目的国"), width: 110, render: (r) => <span>{r.country}</span> },
      {
        key: "form",
        title: t("优惠原产地证"),
        width: 140,
        tip: t("按目的国确定。少这一张，客户在目的港要按普通税率交关税"),
        render: (r) => (r.form ? <Pill tone="violet">{r.form}</Pill> : <span className="muted">{t("不需要")}</span>),
      },
      {
        key: "prog",
        title: t("齐套进度"),
        width: 200,
        sort: (a, b) => a.have / a.total - b.have / b.total,
        render: (r) => (
          <div className="pct-cell">
            <Bar value={r.have} max={r.total} tone={r.missing.length ? "coral" : "jade"} />
            <span className="mono">
              {r.have}/{r.total}
            </span>
          </div>
        ),
      },
      {
        key: "missing",
        title: t("缺件"),
        width: 220,
        render: (r) =>
          r.missing.length ? (
            <span className="doc-miss">
              {r.missing.map((m) => (
                <Pill key={m} tone="coral">
                  {m}
                </Pill>
              ))}
            </span>
          ) : (
            <span className="muted">{t("齐套")}</span>
          ),
      },
      {
        key: "pending",
        title: t("待出具"),
        width: 100,
        align: "right",
        sort: (a, b) => a.pending - b.pending,
        render: (r) => (r.pending ? <span className="cell-num" style={{ color: "var(--amber)" }}>{r.pending}</span> : <span className="muted">—</span>),
      },
      {
        key: "state",
        title: t("放行状态"),
        width: 110,
        render: (r) => <Pill tone={r.releaseState === "已放行" ? "jade" : r.releaseState === "待报关" ? "amber" : "mute"}>{r.releaseState}</Pill>,
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("单证备案")}
      desc={t("按出运批次做齐套检查。缺哪一份、要不要优惠原产地证，出运前一眼看清")}
      kpis={
        <>
          <Kpi icon="file" k={t("在跟批次")} v={formatInt(rows.length)} s={t("未归档的出运")} />
          <Kpi
            icon="check"
            k={t("齐套")}
            v={formatInt(rows.filter((r) => r.ready).length)}
            s={t("单证已备齐并出具")}
            tone="jade"
          />
          <Kpi icon="clock" k={t("待出具")} v={formatInt(pendings.length)} s={t("已列入但还没拿到")} tone={pendings.length ? "amber" : "jade"} />
          <Kpi
            icon="alert"
            k={t("缺件")}
            v={formatInt(gaps.length)}
            s={t("会卡在目的港")}
            tone={gaps.length ? "coral" : "jade"}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜批次 / PI / 客户 / 国家…")} />
          <Segmented
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "gap", label: t("有缺件"), count: gaps.length },
              { value: "pending", label: t("待出具"), count: pendings.length },
            ]}
          />
        </>
      }
    >
      <DataGrid
        gridId="documents"
        exportName={t("单证备案")}
        rows={rows}
        columns={columns}
        onRowOpen={setOpen}
        getRowLabel={(r) => r.batchNo}
        rowTone={(r) => (r.missing.length ? "coral" : r.pending ? "amber" : undefined)}
        empty={<EmptyState icon="file" title={t("没有匹配的批次")} desc={t("换个筛选条件试试")} />}
      />

      <Drawer
        open={!!open}
        title={open?.batchNo ?? ""}
        subtitle={open ? `${open.piNo} · ${open.customer} · ${open.country}` : ""}
        onClose={() => setOpen(null)}
      >
        {open ? (
          <div className="sect">
            <div className="sect-h">
              <Icon name="file" size={14} />
              {t("单证清单")}
              <span className="spacer" />
              <span className="muted">
                {open.have}/{open.total}
              </span>
            </div>
            <div className="doclist">
              {open.need.map((kind) => {
                const d = open.docs.find((x) => x.kind === kind);
                return (
                  <div key={kind} className="docrow" data-missing={d ? undefined : "1"}>
                    <span className="docrow-i">
                      <Icon name={d ? (d.status === "pending" ? "clock" : "check") : "alert"} size={14} />
                    </span>
                    <span className="docrow-t">
                      <b>{kind}</b>
                      <small>{d?.docNo ?? (d ? t("单号待补") : t("尚未列入 —— 出运前必须补齐"))}</small>
                    </span>
                    {d ? (
                      <Pill tone={d.status === "filed" ? "jade" : d.status === "issued" ? "accent" : "amber"}>
                        {t(DOC_STATUS[d.status] ?? d.status)}
                      </Pill>
                    ) : (
                      <Pill tone="coral">{t("缺件")}</Pill>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Drawer>
    </Page>
  );
}

/**
 * 财务侧六个模块：收付款 / 资金汇总 / 银行日记账 / 账户与科目 / 费用明细 / 中信保。
 *
 * 做外贸，「货」那条线出问题最多是晚一周，「钱」那条线出问题是当场没法交货。
 * 所以这几页的设计原则不是「把数据列出来」，而是**每页回答一个具体的问题**：
 *
 *   收付款   → 这笔水单是谁的？（认领）
 *   资金汇总 → 下个月的钱够不够付工厂？（预测）
 *   银行日记账 → 银行的余额和我账上的对不对得上？（逐笔余额）
 *   账户与科目 → 钱花在哪个科目上了？（发生额挂到科目上，不是一棵空树）
 *   费用明细 → 哪一单的费用不正常？（费用率排序）
 *   中信保   → 这个客户还能不能再下一单？（剩余额度 vs 在跟订单额）
 *
 * 数据全部从既有账套推导，没有为了做页面而新造的表。
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { BarList, Sparkline, StackBar } from "@/components/charts";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Drawer } from "@/components/ui/Drawer";
import { Kpi, Page, Panel, useParam } from "@/components/ui/PageKit";
import { Bar, EmptyState, KV, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { listPayments, paymentKpis, type PaymentRow } from "@/data/ops-queries";
import { PAYMENT_STATUS } from "@/data/ops-types";
import { useT } from "@/i18n";
import {
  centsToYuan,
  formatCny,
  formatCompact,
  formatInt,
  formatMoney,
  formatPct,
  rateFromE6,
  shortDate,
  todayIso,
} from "@/lib/format";
import { CREDIT_TONE, sinosureTone, type Tone } from "@/lib/rules";
import { exportXlsx, stampName } from "@/lib/xlsx";

const STATUS_TONE: Record<string, Tone> = { pending: "amber", confirmed: "accent", reconciled: "jade" };

/** 加 n 天，返回 ISO 日期。财务这几页到处要算「未来 30 天」 */
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ═══════════════════ 收付款 / 财务 ═══════════════════ */

export function Payments() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const direction = get("dir");
  const status = get("st");
  /* 「待认领」不是一个状态字段，是一个业务问题：钱到账了但不知道是哪一单的。
     财务每个月最费时间的就是这个，所以给它一个一键筛选而不是让人自己想。 */
  const unclaimed = get("unclaimed") === "1";

  const all = useMemo(() => listPayments(db, { q, direction, status }), [db, q, direction, status]);
  const rows = useMemo(
    () => (unclaimed ? all.filter((r) => !r.piNo && !r.contractNo) : all),
    [all, unclaimed],
  );
  const k = useMemo(() => paymentKpis(all), [all]);
  const unclaimedCount = useMemo(() => all.filter((r) => !r.piNo && !r.contractNo).length, [all]);
  const [open, setOpen] = useState<PaymentRow | null>(null);

  const columns: Column<PaymentRow>[] = useMemo(
    () => [
      {
        key: "no",
        title: t("单号"),
        width: 150,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.paymentNo.localeCompare(b.paymentNo),
        render: (r) => <span className="mono strong">{r.paymentNo}</span>,
      },
      {
        key: "dir",
        title: t("方向"),
        width: 84,
        render: (r) => (
          <Pill tone={r.direction === "in" ? "jade" : "violet"}>{r.direction === "in" ? t("收汇") : t("付汇")}</Pill>
        ),
      },
      {
        key: "party",
        title: t("往来单位"),
        width: 210,
        sort: (a, b) => a.counterparty.localeCompare(b.counterparty),
        render: (r) => <span className="strong">{r.counterparty}</span>,
      },
      {
        key: "ref",
        title: t("关联单据"),
        width: 160,
        tip: t("收汇挂 PI，付汇挂采购合同。都为空说明这笔钱还没人认领"),
        render: (r) =>
          r.piNo ? (
            <Link className="mono link" to={`/orders?q=${encodeURIComponent(r.piNo)}`}>
              {r.piNo}
            </Link>
          ) : r.contractNo ? (
            <Link className="mono link" to={`/purchase-contract?q=${encodeURIComponent(r.contractNo)}`}>
              {r.contractNo}
            </Link>
          ) : (
            <Pill tone="amber">{t("待认领")}</Pill>
          ),
      },
      {
        key: "amt",
        title: t("金额"),
        width: 140,
        align: "right",
        sort: (a, b) => a.cny - b.cny,
        render: (r) => (
          <span className="mono" data-tone={r.direction === "in" ? "jade" : undefined}>
            {r.direction === "in" ? "+" : "−"}
            {formatMoney(r.amount, r.currency === "CNY" ? "¥" : r.currency === "EUR" ? "€" : "$")}
          </span>
        ),
      },
      {
        key: "cny",
        title: t("折人民币"),
        width: 130,
        align: "right",
        sort: (a, b) => a.cny - b.cny,
        render: (r) => <span className="mono muted">{formatCny(r.cny)}</span>,
      },
      { key: "acct", title: t("收付账户"), width: 150, render: (r) => <span className="muted">{r.accountName}</span> },
      {
        key: "date",
        title: t("日期"),
        width: 108,
        sort: (a, b) => a.paidOn.localeCompare(b.paidOn),
        render: (r) => <span className="mono">{shortDate(r.paidOn)}</span>,
      },
      {
        key: "st",
        title: t("状态"),
        width: 100,
        render: (r) => <Pill tone={STATUS_TONE[r.status]}>{t(PAYMENT_STATUS[r.status] ?? r.status)}</Pill>,
      },
      {
        key: "voucher",
        title: t("水单号"),
        width: 150,
        render: (r) => <span className="mono muted">{r.voucherNo ?? "—"}</span>,
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("收付款 / 财务")}
      desc={t("收汇与付汇的登记、认领与核销。每一笔钱都要能说出是哪张单子的")}
      actions={
        <button
          className="btn"
          onClick={() =>
            exportXlsx(
              stampName("收付款"),
              [
                { header: t("单号"), width: 18, value: (r: PaymentRow) => r.paymentNo },
                { header: t("方向"), width: 8, value: (r: PaymentRow) => (r.direction === "in" ? "收汇" : "付汇") },
                { header: t("往来单位"), width: 26, value: (r: PaymentRow) => r.counterparty },
                { header: t("关联单据"), width: 18, value: (r: PaymentRow) => r.piNo ?? r.contractNo ?? "" },
                { header: t("币种"), width: 8, value: (r: PaymentRow) => r.currency },
                { header: t("金额"), width: 14, type: "number", format: "#,##0.00", value: (r: PaymentRow) => r.amount },
                { header: t("折人民币"), width: 14, type: "number", format: "#,##0.00", value: (r: PaymentRow) => r.cny },
                { header: t("日期"), width: 12, value: (r: PaymentRow) => r.paidOn },
                { header: t("状态"), width: 10, value: (r: PaymentRow) => PAYMENT_STATUS[r.status] ?? r.status },
              ],
              rows,
            )
          }
        >
          <Icon name="download" />
          {t("导出 Excel")}
        </button>
      }
      kpis={
        <>
          <Kpi icon="download" k={t("收汇合计")} v={formatCompact(k.inCny, "¥")} s={t("筛选范围内已登记")} tone="jade" />
          <Kpi icon="upload" k={t("付汇合计")} v={formatCompact(k.outCny, "¥")} s={t("含预付与尾款")} />
          <Kpi
            icon="wallet"
            k={t("净流入")}
            v={formatCompact(k.net, "¥")}
            s={t("收汇 − 付汇")}
            tone={k.net >= 0 ? "jade" : "coral"}
          />
          <Kpi
            icon="alert"
            k={t("待认领")}
            v={formatInt(unclaimedCount)}
            s={t("到账但没挂单据")}
            tone={unclaimedCount ? "amber" : undefined}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜单号 / 往来单位 / 水单号…")} />
          <Segmented
            value={direction}
            onChange={(v) => set({ dir: v })}
            options={[
              { value: "", label: t("全部") },
              { value: "in", label: t("收汇") },
              { value: "out", label: t("付汇") },
            ]}
          />
          <Segmented
            value={status}
            onChange={(v) => set({ st: v })}
            options={[
              { value: "", label: t("全部状态") },
              { value: "pending", label: t("待确认") },
              { value: "confirmed", label: t("已确认") },
              { value: "reconciled", label: t("已核销") },
            ]}
          />
          <span className="spacer" />
          <button
            className="btn"
            data-active={unclaimed ? "1" : undefined}
            onClick={() => set({ unclaimed: unclaimed ? null : "1" })}
          >
            <Icon name="alert" />
            {t("只看待认领")}
          </button>
        </>
      }
    >
      <DataGrid
        gridId="payments"
        rows={rows}
        columns={columns}
        onRowOpen={setOpen}
        getRowLabel={(r) => r.paymentNo}
        rowTone={(r) => (!r.piNo && !r.contractNo ? "amber" : undefined)}
        empty={<EmptyState icon="wallet" title={t("没有匹配的收付款记录")} desc={t("换个筛选条件试试")} />}
      />

      <Drawer
        open={!!open}
        title={open?.paymentNo ?? ""}
        subtitle={open ? `${open.direction === "in" ? t("收汇") : t("付汇")} · ${open.counterparty}` : ""}
        onClose={() => setOpen(null)}
      >
        {open ? (
          <div className="kv">
            <KV k={t("方向")} v={open.direction === "in" ? t("收汇（客户付我们）") : t("付汇（我们付供应商）")} />
            <KV k={t("往来单位")} v={open.counterparty} />
            <KV k={t("币种 / 金额")} v={`${open.currency} ${formatMoney(open.amount, "")}`} mono />
            <KV k={t("折人民币")} v={formatCny(open.cny, 2)} mono />
            <KV k={t("收付账户")} v={open.accountName} />
            <KV k={t("入账日期")} v={open.paidOn} mono />
            <KV k={t("水单号")} v={open.voucherNo ?? "—"} mono />
            <KV k={t("状态")} v={<Pill tone={STATUS_TONE[open.status]}>{t(PAYMENT_STATUS[open.status])}</Pill>} />
            <KV
              k={t("关联单据")}
              v={
                open.piNo ? (
                  <Link className="mono link" to={`/orders?q=${encodeURIComponent(open.piNo)}`}>
                    {open.piNo}
                  </Link>
                ) : open.contractNo ? (
                  <Link className="mono link" to={`/purchase-contract?q=${encodeURIComponent(open.contractNo)}`}>
                    {open.contractNo}
                  </Link>
                ) : (
                  <span className="muted">{t("尚未认领 —— 需要指认到具体 PI 或采购合同")}</span>
                )
              }
            />
          </div>
        ) : null}
      </Drawer>
    </Page>
  );
}

/* ═══════════════════ 资金汇总 ═══════════════════ */

/** 账户余额 = 期初 + 本户收 − 本户付 */
function useTreasury() {
  const db = useDb();
  return useMemo(() => {
    const today = todayIso();
    const byAccount = db.ops.accounts.map((a) => {
      const mine = db.ops.payments.filter((p) => p.accountId === a.id);
      const inC = mine.filter((p) => p.direction === "in").reduce((s, p) => s + p.amountCents, 0);
      const outC = mine.filter((p) => p.direction === "out").reduce((s, p) => s + p.amountCents, 0);
      return {
        ...a,
        opening: centsToYuan(a.openingCents),
        in: centsToYuan(inC),
        out: centsToYuan(outC),
        balance: centsToYuan(a.openingCents + inC - outC),
        moves: mine.length,
      };
    });

    /* 折人民币用账套里的自定汇率，跟订单核算一个口径 ——
       财务看的两张表如果汇率不一样，对账时会先吵一架汇率 */
    const rateOf = (cur: string) => {
      if (cur === "CNY") return 1;
      const r = db.fxRates.find((x) => x.base === cur && x.quote === "CNY" && x.kind === "custom");
      return r ? rateFromE6(r.rateE6) : cur === "EUR" ? 7.9 : 7.0;
    };

    const byCurrency = [...new Set(byAccount.map((a) => a.currency))].map((cur) => {
      const accts = byAccount.filter((a) => a.currency === cur);
      const bal = accts.reduce((s, a) => s + a.balance, 0);
      return { currency: cur, balance: bal, cny: bal * rateOf(cur), rate: rateOf(cur), accounts: accts.length };
    });
    const totalCny = byCurrency.reduce((s, c) => s + c.cny, 0);

    /* ── 未来 30 天的钱够不够 ──
       应付：采购合同还没付完的部分，按交货日落到时间轴上。
       应收：未完结订单的应收，按最近一个 ETA 落点；没有 ETA 就按 PI 日期 +45 天估。
       这是外贸最容易出事的地方 —— 下周要给工厂打 80 万，客户尾款还没到。 */
    const horizon = addDays(today, 30);
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const etaByPi = new Map<string, string>();
    for (const s of db.shipments) {
      const eta = db.milestones.find((m) => m.shipmentId === s.id && m.kind === "ETA");
      const d = eta?.plannedOn;
      if (!d) continue;
      if (!s.piId) continue;
      const prev = etaByPi.get(s.piId);
      if (!prev || d < prev) etaByPi.set(s.piId, d);
    }

    const payables = db.ops.contracts
      .filter((c) => c.status !== "closed" && c.amountCents > c.paidCents)
      .map((c) => ({ on: c.deliveryBy ?? addDays(c.signedOn, 45), amount: centsToYuan(c.amountCents - c.paidCents) }))
      .filter((x) => x.on <= horizon);

    const receivables = db.costings
      .filter((c) => c.settleState !== "已完结" && c.receivableCents > 0)
      .map((c) => {
        const pi = piById.get(c.piId);
        return {
          on: etaByPi.get(c.piId) ?? addDays(pi?.signedOn ?? today, 45),
          amount: centsToYuan(c.receivableCents),
        };
      })
      .filter((x) => x.on <= horizon);

    const inflow = receivables.reduce((s, x) => s + x.amount, 0);
    const outflow = payables.reduce((s, x) => s + x.amount, 0);

    /* 按周切成 4 段，看的是「哪一周会破」而不是「30 天总量够不够」——
       总量够但第二周就见底，照样得去拉授信。 */
    const weeks = [0, 1, 2, 3].map((i) => {
      const from = addDays(today, i * 7);
      const to = addDays(today, (i + 1) * 7);
      const inW = receivables.filter((x) => x.on >= from && x.on < to).reduce((s, x) => s + x.amount, 0);
      const outW = payables.filter((x) => x.on >= from && x.on < to).reduce((s, x) => s + x.amount, 0);
      return { label: `${t0(i)}`, from, in: inW, out: outW, net: inW - outW };
    });
    let running = totalCny;
    const projected = weeks.map((w) => {
      running += w.net;
      return { ...w, close: running };
    });

    return { byAccount, byCurrency, totalCny, inflow, outflow, projected, today };
  }, [db]);
}

const t0 = (i: number) => ["第 1 周", "第 2 周", "第 3 周", "第 4 周"][i];

export function Funds() {
  const { t } = useT();
  const tr = useTreasury();
  const worst = tr.projected.reduce((m, w) => (w.close < m.close ? w : m), tr.projected[0]);

  return (
    <Page
      title={t("资金汇总")}
      desc={t("多币种多账户的资金池，以及未来四周的现金流推演")}
      kpis={
        <>
          <Kpi icon="wallet" k={t("资金池合计")} v={formatCompact(tr.totalCny, "¥")} s={t("全部账户折人民币")} />
          <Kpi icon="download" k={t("30 天预计收汇")} v={formatCompact(tr.inflow, "¥")} s={t("未完结订单应收")} tone="jade" />
          <Kpi icon="upload" k={t("30 天预计付汇")} v={formatCompact(tr.outflow, "¥")} s={t("采购合同未付部分")} />
          <Kpi
            icon="gauge"
            k={t("最低点余额")}
            v={formatCompact(worst?.close ?? 0, "¥")}
            s={worst ? t("落在{w}", { w: t(worst.label) }) : "—"}
            tone={(worst?.close ?? 0) < 0 ? "coral" : (worst?.close ?? 0) < tr.totalCny * 0.3 ? "amber" : "jade"}
          />
        </>
      }
    >
      <div className="grid-2">
        <Panel title={t("按币种")} sub={t("余额与折算口径")}>
          <div className="fund-cur">
            {tr.byCurrency.map((c) => (
              <div key={c.currency} className="fund-cur-row">
                <div className="fund-cur-h">
                  <b className="mono">{c.currency}</b>
                  <span className="muted">{t("{n} 个账户", { n: c.accounts })}</span>
                  <span className="spacer" />
                  <span className="mono fund-cur-v">{formatMoney(c.balance, "")}</span>
                </div>
                <Bar value={Math.max(c.cny, 0)} max={Math.max(tr.totalCny, 1)} tone="accent" />
                <div className="fund-cur-f muted">
                  {t("折人民币")} {formatCny(c.cny)} · {t("汇率")} {c.rate.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("未来四周现金流")} sub={t("收 − 付，滚动结余")}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>{t("区间")}</th>
                <th className="r">{t("预计收")}</th>
                <th className="r">{t("预计付")}</th>
                <th className="r">{t("期末结余")}</th>
              </tr>
            </thead>
            <tbody>
              {tr.projected.map((w) => (
                <tr key={w.label} data-tone={w.close < 0 ? "coral" : undefined}>
                  <td>{t(w.label)}</td>
                  <td className="r mono t-jade">{w.in ? "+" + formatCompact(w.in, "¥") : "—"}</td>
                  <td className="r mono">{w.out ? "−" + formatCompact(w.out, "¥") : "—"}</td>
                  <td className="r mono strong">{formatCompact(w.close, "¥")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel-note">
            {t(
              "应付按采购合同交货日落点，应收按最近一个 ETA 落点（无 ETA 的按 PI 日期 +45 天估）。这是推演，不是承诺。",
            )}
          </p>
        </Panel>
      </div>

      <Panel title={t("账户余额")} sub={t("期初 + 收 − 付")}>
        <table className="mini-table">
          <thead>
            <tr>
              <th>{t("账户")}</th>
              <th>{t("开户行")}</th>
              <th>{t("币种")}</th>
              <th className="r">{t("期初")}</th>
              <th className="r">{t("本期收")}</th>
              <th className="r">{t("本期付")}</th>
              <th className="r">{t("当前余额")}</th>
              <th className="r">{t("流水")}</th>
            </tr>
          </thead>
          <tbody>
            {tr.byAccount.map((a) => (
              <tr key={a.id}>
                <td className="strong">{a.name}</td>
                <td className="muted">{a.bank}</td>
                <td className="mono">{a.currency}</td>
                <td className="r mono dim">{formatMoney(a.opening, "")}</td>
                <td className="r mono t-jade">{a.in ? "+" + formatMoney(a.in, "") : "—"}</td>
                <td className="r mono">{a.out ? "−" + formatMoney(a.out, "") : "—"}</td>
                <td className="r mono strong">{formatMoney(a.balance, "")}</td>
                <td className="r">
                  <Link className="link" to={`/bank-journal?acct=${a.id}`}>
                    {t("{n} 笔", { n: a.moves })}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}

/* ═══════════════════ 银行日记账 ═══════════════════ */

export function BankJournal() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const acct = get("acct") || db.ops.accounts[0]?.id || "";
  const q = get("q");

  const account = db.ops.accounts.find((a) => a.id === acct);

  /* 日记账的核心是**逐笔余额**：按时间正序累加，每一行都能跟银行对账单对一眼。
     所以这里不能复用 listPayments（它按时间倒序），得自己排。 */
  const lines = useMemo(() => {
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const contractById = new Map(db.ops.contracts.map((c) => [c.id, c]));
    let bal = centsToYuan(account?.openingCents ?? 0);
    const key = q.trim().toLowerCase();
    return db.ops.payments
      .filter((p) => p.accountId === acct)
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.paymentNo.localeCompare(b.paymentNo))
      .map((p) => {
        const amount = centsToYuan(p.amountCents);
        bal += p.direction === "in" ? amount : -amount;
        const ref = (p.piId ? piById.get(p.piId)?.piNo : null) ?? (p.contractId ? contractById.get(p.contractId)?.contractNo : null);
        return {
          id: p.id,
          paidOn: p.paidOn,
          paymentNo: p.paymentNo,
          voucherNo: p.voucherNo,
          counterparty: p.counterparty,
          debit: p.direction === "in" ? amount : 0,
          credit: p.direction === "out" ? amount : 0,
          balance: bal,
          ref: ref ?? null,
          matched: !!ref,
          status: p.status,
        };
      })
      .filter(
        (l) =>
          !key ||
          `${l.paymentNo} ${l.counterparty} ${l.voucherNo ?? ""} ${l.ref ?? ""}`.toLowerCase().includes(key),
      )
      .reverse();
  }, [db, acct, q, account]);

  const unmatched = lines.filter((l) => !l.matched).length;
  const trend = useMemo(() => [...lines].reverse().map((l) => l.balance), [lines]);
  const symbol = account?.currency === "CNY" ? "¥" : account?.currency === "EUR" ? "€" : "$";

  const columns: Column<(typeof lines)[number]>[] = useMemo(
    () => [
      {
        key: "date",
        title: t("日期"),
        width: 122,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.paidOn.localeCompare(b.paidOn),
        render: (r) => <span className="mono">{r.paidOn}</span>,
      },
      { key: "no", title: t("凭证号"), width: 150, render: (r) => <span className="mono">{r.paymentNo}</span> },
      {
        key: "party",
        title: t("对方户名"),
        width: 220,
        render: (r) => <span className="strong">{r.counterparty}</span>,
      },
      {
        key: "debit",
        title: t("借方（收）"),
        width: 130,
        align: "right",
        sort: (a, b) => a.debit - b.debit,
        render: (r) => (r.debit ? <span className="mono t-jade">{formatMoney(r.debit, symbol)}</span> : <span className="muted">—</span>),
      },
      {
        key: "credit",
        title: t("贷方（付）"),
        width: 130,
        align: "right",
        sort: (a, b) => a.credit - b.credit,
        render: (r) => (r.credit ? <span className="mono">{formatMoney(r.credit, symbol)}</span> : <span className="muted">—</span>),
      },
      {
        key: "bal",
        title: t("余额"),
        width: 140,
        align: "right",
        tip: t("期初余额逐笔累加，可直接跟银行对账单核对"),
        render: (r) => <span className="mono strong">{formatMoney(r.balance, symbol)}</span>,
      },
      {
        key: "match",
        title: t("匹配"),
        width: 170,
        tip: t("流水自动匹配到收付款单据；匹配不上的需要人工认领"),
        render: (r) =>
          r.matched ? (
            <span className="match-ok">
              <Icon name="check" size={13} />
              <span className="mono">{r.ref}</span>
            </span>
          ) : (
            <Pill tone="amber">{t("未匹配")}</Pill>
          ),
      },
      { key: "voucher", title: t("水单号"), width: 150, render: (r) => <span className="mono muted">{r.voucherNo ?? "—"}</span> },
    ],
    [t, symbol],
  );

  return (
    <Page
      title={t("银行日记账")}
      desc={t("按账户的逐笔流水与滚动余额，可直接跟银行对账单核对")}
      kpis={
        <>
          {/* 余额走势画在余额卡里。原来它挂在工具条右侧，
              窄一点就换行跑到账户切换器下面，看着像一张"混进来"的图 ——
              趋势属于它描述的那个数，不该另找地方摆 */}
          <Kpi
            icon="database"
            k={t("当前余额")}
            v={formatMoney(lines[0]?.balance ?? centsToYuan(account?.openingCents ?? 0), symbol)}
            s={account?.name ?? "—"}
            spark={trend.length > 1 ? <Sparkline values={trend} tone="accent" /> : undefined}
          />
          <Kpi icon="download" k={t("本期借方")} v={formatMoney(lines.reduce((s, l) => s + l.debit, 0), symbol)} s={t("收入合计")} tone="jade" />
          <Kpi icon="upload" k={t("本期贷方")} v={formatMoney(lines.reduce((s, l) => s + l.credit, 0), symbol)} s={t("支出合计")} />
          <Kpi icon="alert" k={t("未匹配")} v={formatInt(unmatched)} s={t("需人工认领")} tone={unmatched ? "amber" : "jade"} />
        </>
      }
      toolbar={
        <>
          <Segmented
            value={acct}
            onChange={(v) => set({ acct: v })}
            options={db.ops.accounts.map((a) => ({ value: a.id, label: `${a.name}` }))}
          />
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜凭证号 / 对方户名 / 水单号…")} />
        </>
      }
    >
      <DataGrid
        gridId="bank-journal"
        rows={lines}
        columns={columns}
        getRowLabel={(r) => r.paymentNo}
        rowTone={(r) => (r.matched ? undefined : "amber")}
        empty={<EmptyState icon="database" title={t("这个账户还没有流水")} desc={t("换个账户看看")} />}
      />
    </Page>
  );
}

/* ═══════════════════ 账户与科目 ═══════════════════ */

/**
 * 外贸企业实际在用的科目子集。
 * 空的科目树没有意义，所以每个科目都挂了取数口径（from），
 * 页面直接把本期发生额算出来显示 —— 看得见钱花在哪，这棵树才有人看。
 */
type CostingLine = import("@/data/types").OrderCosting & { fx: number; saleCents: number };

/* 取数口径注意：应收类字段记的是 PI 币种（多数美元），费用与成本记的是人民币。
   科目表要出人民币，所以外币的那两个科目得乘 fx —— 混着加是这类报表最常见的错。 */
const LEDGER: { code: string; name: string; nameEn: string; kind: string; from?: (c: CostingLine) => number }[] = [
  { code: "1002", name: "银行存款", nameEn: "Bank deposits", kind: "资产" },
  { code: "1122", name: "应收账款", nameEn: "Accounts receivable", kind: "资产", from: (c) => c.receivableCents * c.fx },
  { code: "2202", name: "应付账款", nameEn: "Accounts payable", kind: "负债", from: (c) => c.payableCents },
  { code: "6001", name: "主营业务收入", nameEn: "Revenue", kind: "损益", from: (c) => c.saleCents * c.fx },
  { code: "6401", name: "主营业务成本", nameEn: "Cost of sales", kind: "损益", from: (c) => c.purchaseCostCents },
  { code: "660102", name: "销售费用 — 海运费", nameEn: "Selling — freight", kind: "损益", from: (c) => c.freightCents },
  { code: "660103", name: "销售费用 — 报关报检", nameEn: "Selling — customs", kind: "损益", from: (c) => c.customsCents },
  { code: "660104", name: "销售费用 — 银行手续费", nameEn: "Selling — bank charges", kind: "损益", from: (c) => c.bankCents },
  { code: "660199", name: "销售费用 — 其他", nameEn: "Selling — other", kind: "损益", from: (c) => c.otherCents },
];

export function Accounts() {
  const db = useDb();
  const { t, lang } = useT();

  const ledger = useMemo(() => {
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const lines: CostingLine[] = db.costings.map((c) => {
      const pi = piById.get(c.piId);
      const cur = pi?.currency;
      return { ...c, saleCents: pi?.amountCents ?? 0, fx: cur === "CNY" ? 1 : cur === "EUR" ? 7.9 : 6.7 };
    });
    const total = (pick: (c: CostingLine) => number) => centsToYuan(lines.reduce((s, c) => s + pick(c), 0));
    return LEDGER.map((a) => ({ ...a, amount: a.from ? total(a.from) : null }));
  }, [db]);
  const maxAmount = Math.max(...ledger.map((a) => a.amount ?? 0), 1);

  return (
    <Page
      title={t("账户与科目")}
      desc={t("银行账户主档，以及带本期发生额的会计科目表")}
      kpis={
        <>
          <Kpi icon="database" k={t("银行账户")} v={formatInt(db.ops.accounts.length)} s={t("启用中")} />
          <Kpi icon="wallet" k={t("币种")} v={formatInt(new Set(db.ops.accounts.map((a) => a.currency)).size)} s={t("多币种结算")} />
          <Kpi icon="file" k={t("会计科目")} v={formatInt(LEDGER.length)} s={t("外贸常用子集")} />
          <Kpi icon="building" k={t("开票主体")} v={formatInt(db.sellerEntities.length)} s={t("见 PI 卖方档案")} />
        </>
      }
    >
      <Panel title={t("银行账户")} sub={t("PI 上的收款账户从这里选")}>
        <table className="mini-table">
          <thead>
            <tr>
              <th>{t("账户名称")}</th>
              <th>{t("开户行")}</th>
              <th>{t("账号")}</th>
              <th>{t("币种")}</th>
              <th className="r">{t("期初余额")}</th>
              <th>{t("状态")}</th>
            </tr>
          </thead>
          <tbody>
            {db.ops.accounts.map((a) => (
              <tr key={a.id}>
                <td className="strong">{a.name}</td>
                <td className="muted">{a.bank}</td>
                <td className="mono muted">{a.accountNo}</td>
                <td className="mono">{a.currency}</td>
                <td className="r mono">{formatMoney(centsToYuan(a.openingCents), "")}</td>
                <td>
                  <Pill tone={a.active ? "jade" : "mute"}>{a.active ? t("启用") : t("停用")}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={t("会计科目")} sub={t("金额取自订单核算，口径与费用明细报表一致")}>
        <table className="mini-table ledger">
          <thead>
            <tr>
              <th>{t("科目编码")}</th>
              <th>{t("科目名称")}</th>
              <th>{t("类别")}</th>
              <th className="r">{t("本期发生额")}</th>
              <th>{t("占比")}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((a) => (
              <tr key={a.code}>
                <td className="mono muted">{a.code}</td>
                <td className="strong">{lang === "en" ? a.nameEn : a.name}</td>
                <td>
                  <Pill tone={a.kind === "资产" ? "accent" : a.kind === "负债" ? "violet" : "mute"}>{t(a.kind)}</Pill>
                </td>
                <td className="r mono">{a.amount === null ? <span className="muted">{t("按账户取数")}</span> : formatCny(a.amount)}</td>
                <td className="ledger-bar">
                  {a.amount === null ? null : <Bar value={a.amount} max={maxAmount} tone="accent" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}

/* ═══════════════════ 费用明细报表 ═══════════════════ */

export function Expenses() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");
  const owner = get("owner");

  const rows = useMemo(() => {
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    const custById = new Map(db.customers.map((c) => [c.id, c]));
    const userById = new Map(db.users.map((u) => [u.id, u]));
    const key = q.trim().toLowerCase();
    return db.costings
      .map((c) => {
        const pi = piById.get(c.piId);
        const cust = pi ? custById.get(pi.customerId) : undefined;
        const sales = cust?.salesId ? userById.get(cust.salesId) : undefined;
        const freight = centsToYuan(c.freightCents);
        const customs = centsToYuan(c.customsCents);
        const bank = centsToYuan(c.bankCents);
        const other = centsToYuan(c.otherCents);
        const expense = freight + customs + bank + other;
        /* 注意口径：费用四项记的是人民币，receivableCents 记的是 PI 币种（多数是美元）。
           不折算就直接相除，费用率会凭空放大约 6.7 倍。 */
        const fx = pi?.currency === "CNY" ? 1 : pi?.currency === "EUR" ? 7.9 : 6.7;
        const revenue = centsToYuan(c.receivableCents) * fx;
        return {
          id: c.id,
          piNo: pi?.piNo ?? "—",
          customer: cust?.name ?? "—",
          salesId: cust?.salesId ?? "",
          sales: sales?.name ?? "—",
          salesEn: sales?.nameEn,
          purchase: centsToYuan(c.purchaseCostCents),
          freight,
          customs,
          bank,
          other,
          expense,
          revenue,
          /* 费用率 = 期间费用 / 应收。同类产品之间横比，异常的一眼跳出来 ——
             比单看绝对金额有用得多，大单的费用天然就高。 */
          rate: revenue > 0 ? (expense / revenue) * 100 : 0,
        };
      })
      .filter((r) => !owner || r.salesId === owner)
      .filter((r) => !key || `${r.piNo} ${r.customer}`.toLowerCase().includes(key))
      .sort((a, b) => b.rate - a.rate);
  }, [db, q, owner]);

  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const totalExpense = sum((r) => r.expense);
  const totalRevenue = sum((r) => r.revenue);
  const buckets = [
    { label: t("海运费"), value: sum((r) => r.freight), tone: "accent" },
    { label: t("报关报检"), value: sum((r) => r.customs), tone: "violet" },
    { label: t("银行手续费"), value: sum((r) => r.bank), tone: "amber" },
    { label: t("其他"), value: sum((r) => r.other), tone: "mute" },
  ];

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "pi",
        title: t("PI 号"),
        width: 150,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.piNo.localeCompare(b.piNo),
        render: (r) => (
          <Link className="mono link" to={`/orders?q=${encodeURIComponent(r.piNo)}`}>
            {r.piNo}
          </Link>
        ),
      },
      { key: "cust", title: t("客户"), width: 200, sort: (a, b) => a.customer.localeCompare(b.customer), render: (r) => <span className="strong">{r.customer}</span> },
      { key: "sales", title: t("业务员"), width: 100, render: (r) => <span className="muted">{r.sales}</span> },
      { key: "freight", title: t("海运费"), width: 118, align: "right", sort: (a, b) => a.freight - b.freight, render: (r) => <span className="mono">{formatCny(r.freight)}</span> },
      { key: "customs", title: t("报关报检"), width: 118, align: "right", sort: (a, b) => a.customs - b.customs, render: (r) => <span className="mono">{formatCny(r.customs)}</span> },
      { key: "bank", title: t("银行手续费"), width: 128, align: "right", sort: (a, b) => a.bank - b.bank, render: (r) => <span className="mono">{formatCny(r.bank)}</span> },
      { key: "other", title: t("其他"), width: 110, align: "right", sort: (a, b) => a.other - b.other, render: (r) => <span className="mono">{formatCny(r.other)}</span> },
      {
        key: "exp",
        title: t("费用合计"),
        width: 128,
        align: "right",
        sort: (a, b) => a.expense - b.expense,
        render: (r) => <span className="mono strong">{formatCny(r.expense)}</span>,
      },
      {
        key: "rate",
        title: t("费用率"),
        width: 118,
        align: "right",
        tip: t("费用合计 ÷ 应收。同类产品之间横比，异常的一眼看得出"),
        sort: (a, b) => a.rate - b.rate,
        render: (r) => (
          <span className="mono" data-tone={r.rate > 20 ? "coral" : r.rate > 15 ? "amber" : undefined}>
            {formatPct(r.rate, 1)}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <Page
      title={t("费用明细报表")}
      desc={t("按订单穿透的费用构成，默认按费用率从高到低排 —— 不正常的排在最前面")}
      actions={
        <button
          className="btn"
          onClick={() =>
            exportXlsx(
              stampName("费用明细"),
              [
                { header: "PI", width: 18, value: (r: (typeof rows)[number]) => r.piNo },
                { header: t("客户"), width: 26, value: (r: (typeof rows)[number]) => r.customer },
                { header: t("海运费"), width: 14, type: "number", format: "#,##0.00", value: (r: (typeof rows)[number]) => r.freight },
                { header: t("报关报检"), width: 14, type: "number", format: "#,##0.00", value: (r: (typeof rows)[number]) => r.customs },
                { header: t("银行手续费"), width: 14, type: "number", format: "#,##0.00", value: (r: (typeof rows)[number]) => r.bank },
                { header: t("其他"), width: 14, type: "number", format: "#,##0.00", value: (r: (typeof rows)[number]) => r.other },
                { header: t("费用合计"), width: 14, type: "number", format: "#,##0.00", value: (r: (typeof rows)[number]) => r.expense },
                { header: t("费用率"), width: 10, type: "number", format: "0.00", value: (r: (typeof rows)[number]) => r.rate },
              ],
              rows,
            )
          }
        >
          <Icon name="download" />
          {t("导出 Excel")}
        </button>
      }
      kpis={
        <>
          <Kpi icon="pie" k={t("费用合计")} v={formatCompact(totalExpense, "¥")} s={t("{n} 张订单", { n: rows.length })} />
          <Kpi
            icon="gauge"
            k={t("整体费用率")}
            v={formatPct(totalRevenue ? (totalExpense / totalRevenue) * 100 : 0, 1)}
            s={t("费用 ÷ 应收")}
            tone={totalRevenue && totalExpense / totalRevenue > 0.1 ? "amber" : "jade"}
          />
          <Kpi icon="ship" k={t("海运费占比")} v={formatPct(totalExpense ? (buckets[0].value / totalExpense) * 100 : 0, 1)} s={t("最大的一块")} />
          <Kpi
            icon="alert"
            k={t("费用率超 20%")}
            v={formatInt(rows.filter((r) => r.rate > 20).length)}
            s={t("建议逐单复核")}
            tone={rows.some((r) => r.rate > 20) ? "coral" : "jade"}
          />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜 PI 号 / 客户…")} />
          <Segmented
            value={owner}
            onChange={(v) => set({ owner: v })}
            options={[
              { value: "", label: t("全部业务员") },
              ...db.users.filter((u) => u.role === "sales").map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </>
      }
    >
      <Panel title={t("费用构成")} sub={t("筛选范围内的科目占比")}>
        <StackBar items={buckets} />
      </Panel>
      <DataGrid
        gridId="expenses"
        rows={rows}
        columns={columns}
        getRowLabel={(r) => r.piNo}
        rowTone={(r) => (r.rate > 20 ? "coral" : r.rate > 15 ? "amber" : undefined)}
        empty={<EmptyState icon="pie" title={t("没有匹配的订单")} desc={t("换个筛选条件试试")} />}
      />
    </Page>
  );
}

/* ═══════════════════ 中信保客户信息 ═══════════════════ */

export function Sinosure() {
  const db = useDb();
  const { t } = useT();
  const { get, set } = useParam();
  const q = get("q");

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    /* 在跟订单额：这个客户手上还没结清的单子有多少钱。
       中信保真正要回答的问题不是「用了多少」，而是**「还能不能再下一单」** ——
       剩余额度盖不住在跟金额，就是下一票货发出去时没有保险。 */
    const openByCustomer = new Map<string, number>();
    const piById = new Map(db.pis.map((p) => [p.id, p]));
    for (const c of db.costings) {
      if (c.settleState === "已完结") continue;
      const pi = piById.get(c.piId);
      if (!pi) continue;
      openByCustomer.set(pi.customerId, (openByCustomer.get(pi.customerId) ?? 0) + centsToYuan(c.receivableCents));
    }
    const userById = new Map(db.users.map((u) => [u.id, u]));

    return db.customers
      .filter((c) => c.sinosureLimitCents > 0)
      .map((c) => {
        const limit = centsToYuan(c.sinosureLimitCents);
        const used = centsToYuan(c.sinosureUsedCents);
        const open = openByCustomer.get(c.id) ?? 0;
        const free = limit - used;
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          country: c.country,
          creditLevel: c.creditLevel,
          sales: (c.salesId ? userById.get(c.salesId)?.name : null) ?? "—",
          limit,
          used,
          free,
          open,
          pct: limit > 0 ? (used / limit) * 100 : 0,
          /* 在跟金额超过剩余额度 = 下一单发出去就在裸奔 */
          exposed: open > free,
        };
      })
      .filter((r) => !key || `${r.name} ${r.code} ${r.country}`.toLowerCase().includes(key))
      .sort((a, b) => b.pct - a.pct);
  }, [db, q]);

  const overLimit = rows.filter((r) => r.pct >= 85);
  const exposed = rows.filter((r) => r.exposed);

  const columns: Column<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        key: "name",
        title: t("客户"),
        width: 230,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.name.localeCompare(b.name),
        render: (r) => (
          <Link className="link strong" to={`/customers?q=${encodeURIComponent(r.name)}`}>
            {r.name}
          </Link>
        ),
      },
      { key: "country", title: t("国家"), width: 110, render: (r) => <span className="muted">{r.country}</span> },
      {
        key: "level",
        title: t("信用等级"),
        width: 100,
        render: (r) => <Pill tone={CREDIT_TONE[r.creditLevel] ?? "mute"}>{r.creditLevel}</Pill>,
      },
      { key: "limit", title: t("投保限额"), width: 130, align: "right", sort: (a, b) => a.limit - b.limit, render: (r) => <span className="mono">{formatMoney(r.limit, "$")}</span> },
      { key: "used", title: t("已占用"), width: 130, align: "right", sort: (a, b) => a.used - b.used, render: (r) => <span className="mono">{formatMoney(r.used, "$")}</span> },
      {
        key: "pct",
        title: t("占用率"),
        width: 170,
        sort: (a, b) => a.pct - b.pct,
        render: (r) => (
          <div className="pct-cell">
            <Bar value={r.used} max={Math.max(r.limit, 1)} tone={sinosureTone(r.used, r.limit)} />
            <span className="mono">{formatPct(r.pct, 0)}</span>
          </div>
        ),
      },
      {
        key: "free",
        title: t("剩余额度"),
        width: 130,
        align: "right",
        sort: (a, b) => a.free - b.free,
        render: (r) => (
          <span className="mono" data-tone={r.free <= 0 ? "coral" : undefined}>
            {formatMoney(r.free, "$")}
          </span>
        ),
      },
      {
        key: "open",
        title: t("在跟订单额"),
        width: 150,
        align: "right",
        tip: t("未完结订单的应收合计。超过剩余额度就意味着下一票货没有保险覆盖"),
        sort: (a, b) => a.open - b.open,
        render: (r) => (
          <span className="mono" data-tone={r.exposed ? "coral" : undefined}>
            {formatMoney(r.open, "$")}
          </span>
        ),
      },
      {
        key: "risk",
        title: t("提示"),
        width: 160,
        render: (r) =>
          r.exposed ? (
            <Pill tone="coral">{t("超出可保范围")}</Pill>
          ) : r.pct >= 85 ? (
            <Pill tone="amber">{t("接近上限")}</Pill>
          ) : (
            <Pill tone="jade">{t("正常")}</Pill>
          ),
      },
      { key: "sales", title: t("业务员"), width: 100, render: (r) => <span className="muted">{r.sales}</span> },
    ],
    [t],
  );

  return (
    <Page
      title={t("中信保客户信息")}
      desc={t("投保限额与占用情况。真正要回答的问题是：这个客户还能不能再下一单")}
      kpis={
        <>
          <Kpi icon="shield" k={t("投保客户")} v={formatInt(rows.length)} s={t("有限额的客户")} />
          <Kpi icon="wallet" k={t("限额合计")} v={formatCompact(rows.reduce((s, r) => s + r.limit, 0), "$")} s={t("全部投保额度")} />
          <Kpi
            icon="gauge"
            k={t("接近上限")}
            v={formatInt(overLimit.length)}
            s={t("占用率 ≥ 85%")}
            tone={overLimit.length ? "amber" : "jade"}
          />
          <Kpi
            icon="alert"
            k={t("超出可保范围")}
            v={formatInt(exposed.length)}
            s={t("在跟额 > 剩余额度")}
            tone={exposed.length ? "coral" : "jade"}
          />
        </>
      }
      toolbar={<SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜客户 / 编码 / 国家…")} />}
    >
      {exposed.length ? (
        <Panel title={t("需要先回款再下单")} sub={t("在跟订单额已经盖不住剩余额度")}>
          <BarList
            data={exposed.slice(0, 6).map((r) => ({ name: r.name, value: Math.round(r.open - r.free), tone: "coral" }))}
            format={(v) => formatMoney(v, "$")}
          />
        </Panel>
      ) : null}
      <DataGrid
        gridId="sinosure"
        rows={rows}
        columns={columns}
        getRowLabel={(r) => r.name}
        rowTone={(r) => (r.exposed ? "coral" : r.pct >= 85 ? "amber" : undefined)}
        empty={<EmptyState icon="shield" title={t("没有匹配的投保客户")} desc={t("换个搜索词试试")} />}
      />
    </Page>
  );
}

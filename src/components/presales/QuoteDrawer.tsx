/**
 * 报价单详情 —— 明细 / 核算 / 议价轨迹 / 附件。
 *
 * ── 核算器为什么长这样 ──
 * 业务员在客户电话里要的是一句话："这个价能不能做"。所以核算页把
 * **结论放在最上面**（利润率 + 一句人话判断），参数摆在下面 ——
 * 而不是像 Excel 那样从上到下一堆输入格，答案埋在最后一行。
 *
 * ── 正算与反算是同一张表的两个方向 ──
 * 左边改参数看结果（正算），右边填目标利润率看该报多少（反算）。
 * 反算出来的价**不会自动写进明细行**，要点一下"应用"——
 * 谈判中途手滑改一个数就把客户的报价单改了，这是不能接受的。
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { Attachments } from "@/components/Attachments";
import { KV, Pill } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { quoteHistory, type QuoteRow } from "@/data/presales-queries";
import {
  addQuoteLine,
  applyPrices,
  convertToPi,
  patchCalc,
  patchQuote,
  patchQuoteLine,
  removeQuoteLine,
  reviseQuote,
} from "@/data/presales-mutations";
import { nextPiNo } from "@/data/mutations";
import { INCOTERMS, QUOTE_STATUS, findIncoterm, type Incoterm } from "@/data/presales-types";
import { unitEn } from "@/lib/docs";
import { calcQuote, lineRefundCents, lineRevenueCents, linePurchaseCents, packSummary, scaleToTarget, solveRevenue } from "@/lib/quote-calc";
import { centsToYuan, formatInt, formatMoney, shortDate } from "@/lib/format";
import { useTextField } from "@/lib/hooks";
import { canSeeCost } from "@/lib/perms";
import { useT } from "@/i18n";
import { CC_BY_COUNTRY } from "@/lib/geo";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };
const symOf = (c: string) => SYM[c] ?? `${c} `;

/** 数字输入。空串不能直接当 0 —— 那样删到最后一位就跳回 0，没法接着打 */
function Num({
  value,
  onChange,
  step = 1,
  suffix,
  width = 92,
  digits = 2,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  width?: number;
  digits?: number;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(Number(value.toFixed(digits))) : "");
  return (
    <span className="numin" style={{ width }}>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        value={shown}
        aria-label={label}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix ? <i>{suffix}</i> : null}
    </span>
  );
}

/** 文本输入，走 useTextField —— 品名要能打中文 */
function Text({ value, onChange, label, width }: { value: string; onChange: (v: string) => void; label: string; width?: number }) {
  const f = useTextField(value, onChange);
  return (
    <input
      className="input"
      style={width ? { width } : undefined}
      value={f.value}
      onChange={f.onChange}
      onCompositionStart={f.onCompositionStart}
      onCompositionEnd={f.onCompositionEnd}
      aria-label={label}
    />
  );
}

export function QuoteDrawer({
  row,
  onClose,
  onPrev,
  onNext,
}: {
  row: QuoteRow | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const db = useDb();
  const { user } = useAuth();
  const { t, lang } = useT();
  const [tab, setTab] = useState("lines");
  const [revising, setRevising] = useState(false);
  const [revNote, setRevNote] = useState("");
  const [converting, setConverting] = useState(false);
  const [piNo, setPiNo] = useState("");
  const seeCost = canSeeCost(user);

  // row 是列表算出来的快照；抽屉里要用最新的，否则改一个数字要等列表重算
  const q = row ? db.presales.quotes.find((x) => x.id === row.id) ?? null : null;
  const lines = useMemo(
    () => (q ? db.presales.quoteLines.filter((l) => l.quoteId === q.id).sort((a, b) => a.seq - b.seq) : []),
    [db, q],
  );
  const calc = useMemo(() => (q ? calcQuote(lines, q.calc, q.incoterm) : null), [lines, q]);
  const pack = useMemo(() => packSummary(lines), [lines]);
  const history = useMemo(() => (q ? quoteHistory(db, q.quoteNo) : []), [db, q]);

  if (!row || !q || !calc) return null;

  const sym = symOf(q.currency);
  const cny = "¥";
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const locked = q.status === "converted";

  /* 反算：给定目标利润率，该报多少 */
  const targetTotal = solveRevenue(lines, q.calc, q.incoterm, q.calc.targetMarginBp);
  const suggested = scaleToTarget(lines, targetTotal);
  const gapPct = calc.revenueCents > 0 && targetTotal > 0 ? ((targetTotal - calc.revenueCents) / calc.revenueCents) * 100 : 0;

  const marginTone = calc.marginBp < 0 ? "coral" : calc.marginBp < 1100 ? "amber" : calc.marginBp < 2000 ? "accent" : "jade";
  const verdict =
    calc.marginBp < 0
      ? t("这个价是亏的，别报")
      : calc.marginBp < 1100
        ? t("低于 11% 红线，报之前要走审批")
        : calc.marginBp < 2000
          ? t("能做，利润一般")
          : t("利润健康");

  return (
    <>
      <Drawer
        open
        storageKey="mt.drawer.quote"
        /* 报价单里是一张可编辑的明细表（品名 / 数量 / 单价 / 金额 / 采购价 / 毛利率），
           580 会把后三列挤到横向滚动条里 —— 而"毛利率"恰恰是这张表最该被看见的一列 */
        defaultWidth={920}
        title={
          <span className="dr-title">
            <span className="num">{q.quoteNo}</span>
            <Pill tone={q.version > 1 ? "violet" : "mute"} dot={false}>
              v{q.version}
            </Pill>
            <Pill tone={q.status === "converted" ? "jade" : q.status === "rejected" || q.status === "expired" ? "coral" : q.status === "negotiating" ? "amber" : "accent"}>
              {t(QUOTE_STATUS[q.status] ?? q.status)}
            </Pill>
          </span>
        }
        subtitle={
          <span className="dr-sub">
            <Flag cc={CC_BY_COUNTRY[q.country]} />
            {q.company} · {q.incoterm} {q.pod || "—"} · {t("有效期至")} {shortDate(q.validUntil)}
          </span>
        }
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        tabs={[
          { key: "lines", label: t("明细") },
          { key: "calc", label: t("核算") },
          { key: "history", label: t("轨迹 {n}", { n: history.length }) },
          { key: "files", label: t("附件") },
        ]}
        tab={tab}
        onTab={setTab}
        footer={
          <>
            {locked ? (
              <span className="muted">
                {t("已转成")} <Link to={`/orders?q=${row.piNo ?? ""}`}>{row.piNo}</Link>
              </span>
            ) : (
              <>
                <button className="btn" onClick={() => setRevising(true)}>
                  <Icon name="copy" size={14} />
                  {t("开新一版")}
                </button>
                <span className="spacer" />
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setPiNo(nextPiNo(db));
                    setConverting(true);
                  }}
                >
                  <Icon name="check" size={14} />
                  {t("转成 PI")}
                </button>
              </>
            )}
          </>
        }
      >
        {tab === "lines" ? (
          <div className="qd">
            <div className="qd-head">
              <div className="kvs">
                <KV k={t("客户")} v={q.company} />
                <KV k={t("目的港")} v={<Text value={q.pod} onChange={(v) => patchQuote(q.id, { pod: v })} label={t("目的港")} width={140} />} />
                <KV
                  k={t("贸易术语")}
                  v={
                    <select className="select select-xs" value={q.incoterm} onChange={(e) => patchQuote(q.id, { incoterm: e.target.value as Incoterm })} aria-label={t("贸易术语")}>
                      {INCOTERMS.map((i) => (
                        <option key={i.code} value={i.code}>
                          {i.code} · {lang === "en" ? i.en : i.zh}
                        </option>
                      ))}
                    </select>
                  }
                />
                <KV
                  k={t("币种")}
                  v={
                    <select className="select select-xs" value={q.currency} onChange={(e) => patchQuote(q.id, { currency: e.target.value })} aria-label={t("币种")}>
                      {["USD", "EUR", "CNY", "GBP"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  }
                />
                <KV k={t("交货期")} v={<Num value={q.leadDays} onChange={(v) => patchQuote(q.id, { leadDays: Math.round(v) })} suffix={t("天")} width={82} digits={0} label={t("交货期")} />} />
                <KV
                  k={t("有效期")}
                  v={<input className="input" style={{ width: 140 }} type="date" value={q.validUntil} onChange={(e) => patchQuote(q.id, { validUntil: e.target.value })} aria-label={t("有效期")} />}
                />
              </div>
              <KV k={t("付款方式")} v={<Text value={q.payTerm} onChange={(v) => patchQuote(q.id, { payTerm: v })} label={t("付款方式")} />} />
            </div>

            <div className="qline-wrap">
              <table className="qline">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>#</th>
                    <th>{t("品名")}</th>
                    <th style={{ width: 96 }}>{t("数量")}</th>
                    <th style={{ width: 104 }}>{t("单价")}</th>
                    <th style={{ width: 108 }} className="ar">{t("金额")}</th>
                    {seeCost ? <th style={{ width: 100 }}>{t("采购价")}</th> : null}
                    {seeCost ? <th style={{ width: 76 }} className="ar">{t("毛利率")}</th> : null}
                    <th style={{ width: 30 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const rev = lineRevenueCents(l);
                    const cost = linePurchaseCents(l);
                    const refund = q.calc.refundCounted ? lineRefundCents(l) : 0;
                    const revCny = (rev * q.calc.rateE6) / 1_000_000;
                    const gm = revCny > 0 ? ((revCny + refund - cost) / revCny) * 100 : 0;
                    return (
                      <tr key={l.id}>
                        <td className="muted num">{l.seq}</td>
                        <td>
                          <Text value={lang === "en" ? l.nameEn || l.name : l.name} onChange={(v) => patchQuoteLine(l.id, lang === "en" ? { nameEn: v } : { name: v })} label={t("品名")} />
                          <div className="cell-sub">
                            <span className="num">{l.hsCode ?? "—"}</span>
                            <span>·</span>
                            <span>{t("每箱")} {l.packQty || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <Num value={l.qty} onChange={(v) => patchQuoteLine(l.id, { qty: Math.max(0, Math.round(v)) })} digits={0} width={90} label={t("数量")} suffix={lang === "en" ? unitEn(l.unit) : l.unit} />
                        </td>
                        <td>
                          <Num value={l.unitPriceE4 / 10_000} onChange={(v) => patchQuoteLine(l.id, { unitPriceE4: Math.round(v * 10_000) })} step={0.0001} digits={4} width={98} label={t("单价")} />
                        </td>
                        <td className="ar num strong">{formatMoney(centsToYuan(rev), sym)}</td>
                        {seeCost ? (
                          <td>
                            <Num value={l.costE4 / 10_000} onChange={(v) => patchQuoteLine(l.id, { costE4: Math.round(v * 10_000) })} step={0.0001} digits={4} width={94} label={t("采购价")} />
                          </td>
                        ) : null}
                        {seeCost ? (
                          <td className="ar">
                            <span className="num" style={{ color: gm < 11 ? "var(--coral)" : gm < 20 ? "var(--amber)" : undefined }}>
                              {gm.toFixed(1)}%
                            </span>
                          </td>
                        ) : null}
                        <td>
                          <button className="icon-btn danger" onClick={() => removeQuoteLine(l.id)} aria-label={t("删除这一行")} data-tip={t("删除这一行")}>
                            <Icon name="x" size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="ar muted">{t("合计")}</td>
                    <td className="ar num strong">{formatMoney(centsToYuan(calc.revenueCents), sym)}</td>
                    {seeCost ? <td /> : null}
                    {seeCost ? (
                      <td className="ar">
                        <Pill tone={marginTone} dot={false}>
                          {(calc.marginBp / 100).toFixed(2)}%
                        </Pill>
                      </td>
                    ) : null}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="qd-add">
              <select
                className="select select-xs"
                value=""
                onChange={(e) => {
                  if (e.target.value) addQuoteLine(q.id, e.target.value);
                }}
                aria-label={t("添加一行")}
              >
                <option value="">{t("＋ 从产品库添加一行…")}</option>
                {db.ops.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {lang === "en" ? (p.nameEn ?? p.name) : p.name}
                  </option>
                ))}
              </select>
              <button className="link-btn" onClick={() => addQuoteLine(q.id, null)}>
                <Icon name="plus" size={13} />
                {t("加一行空行")}
              </button>
            </div>

            {/* 装箱汇总。报价时最容易忽略、事后最容易吃亏的一件事：
                差一点凑不满一个柜。这里把箱数、方数、几个柜直接写出来 */}
            <div className="qd-pack">
              <span>
                <Icon name="box" size={13} /> {formatInt(pack.cartons)} {t("箱")}
              </span>
              <span>{pack.grossKg.toFixed(0)} kg</span>
              <span>{pack.cbm.toFixed(2)} CBM</span>
              <span className={pack.teu % 1 > 0.75 ? "warn" : undefined}>
                ≈ {pack.teu.toFixed(2)} × 20GP
                {pack.teu % 1 > 0.75 ? ` · ${t("差一点就满柜，建议加量")}` : ""}
              </span>
            </div>
          </div>
        ) : null}

        {tab === "calc" ? (
          <div className="qcalc">
            {/* 结论在最上面。业务员在客户电话里要的是一句话 */}
            <div className="qcalc-verdict" data-tone={marginTone}>
              <div>
                <span className="qv-k">{t("利润率")}</span>
                <span className="qv-v num">{(calc.marginBp / 100).toFixed(2)}%</span>
              </div>
              <div>
                <span className="qv-k">{t("这单赚")}</span>
                <span className="qv-v num">{formatMoney(centsToYuan(calc.profitCents), cny)}</span>
              </div>
              <div>
                <span className="qv-k">{t("保本价")}</span>
                <span className="qv-v num">{formatMoney(centsToYuan(calc.breakEvenCents), sym)}</span>
              </div>
              <p className="qv-say">{verdict}</p>
            </div>

            <div className="qcalc-grid">
              <section className="card">
                <header className="card-head">
                  <h3>{t("核算参数")}</h3>
                  <span className="card-sub">{t("{term} 下我方承担的部分才计入", { term: q.incoterm })}</span>
                </header>
                <div className="card-body qcalc-params">
                  <label className="qp">
                    {/* 币种对写在标签里，不写成输入框后缀 —— "USD→CNY" 有七个字符，
                        塞进后缀会压在数字上，而汇率恰恰是这一栏里最需要看清的数 */}
                    <span>
                      {t("采购汇率")} <i className="qp-unit">{q.currency}→CNY</i>
                    </span>
                    <Num value={q.calc.rateE6 / 1_000_000} onChange={(v) => patchCalc(q.id, { rateE6: Math.round(v * 1_000_000) })} step={0.0001} digits={4} width={110} label={t("采购汇率")} />
                  </label>
                  <label className="qp" data-off={findIncoterm(q.incoterm).freight ? undefined : "1"}>
                    <span>{t("海运费")}</span>
                    <Num value={centsToYuan(q.calc.freightCents)} onChange={(v) => patchCalc(q.id, { freightCents: Math.round(v * 100) })} suffix="¥" width={110} label={t("海运费")} />
                  </label>
                  <label className="qp" data-off={q.incoterm === "EXW" ? "1" : undefined}>
                    <span>{t("出口国内费用")}</span>
                    <Num value={centsToYuan(q.calc.localCents)} onChange={(v) => patchCalc(q.id, { localCents: Math.round(v * 100) })} suffix="¥" width={110} label={t("出口国内费用")} />
                  </label>
                  <label className="qp" data-off={findIncoterm(q.incoterm).insurance ? undefined : "1"}>
                    <span>{t("保险费率")}</span>
                    <Num value={q.calc.insuranceRateBp / 100} onChange={(v) => patchCalc(q.id, { insuranceRateBp: Math.round(v * 100) })} step={0.01} suffix="%" width={80} label={t("保险费率")} />
                  </label>
                  <label className="qp">
                    <span>{t("银行费率")}</span>
                    <Num value={q.calc.bankRateBp / 100} onChange={(v) => patchCalc(q.id, { bankRateBp: Math.round(v * 100) })} step={0.01} suffix="%" width={80} label={t("银行费率")} />
                  </label>
                  <label className="qp" data-off={findIncoterm(q.incoterm).destCharge ? undefined : "1"}>
                    <span>{t("目的港清关+关税")}</span>
                    <Num value={centsToYuan(q.calc.destCents)} onChange={(v) => patchCalc(q.id, { destCents: Math.round(v * 100) })} suffix="¥" width={110} label={t("目的港费用")} />
                  </label>
                  <label className="qp qp-check">
                    <input type="checkbox" checked={q.calc.refundCounted} onChange={(e) => patchCalc(q.id, { refundCounted: e.target.checked })} />
                    <span>{t("退税计入收益")}</span>
                    <i className="qp-hint">{t("多数公司算的是含退税的净利")}</i>
                  </label>
                </div>
              </section>

              <section className="card">
                <header className="card-head">
                  <h3>{t("这单的账")}</h3>
                  <span className="card-sub">{t("人民币")}</span>
                </header>
                <div className="card-body">
                  <ul className="qbill">
                    <li className="in">
                      <span>{t("销售收入")}</span>
                      <b className="num">{formatMoney(centsToYuan(calc.revenueCnyCents), cny)}</b>
                    </li>
                    <li className="in">
                      <span>
                        {t("出口退税")}
                        {/* 这个提示是这套核算器最容易被算错的一处，值得占一行 */}
                        <i className="qb-tip" data-tip={t("退税 = 含税采购额 ÷ 1.13 × 退税率，不是采购额 × 13%")}>
                          <Icon name="info" size={11} />
                        </i>
                      </span>
                      <b className="num">{q.calc.refundCounted ? formatMoney(centsToYuan(calc.refundCents), cny) : t("不计")}</b>
                    </li>
                    {seeCost ? (
                      <li>
                        <span>{t("采购成本（含税）")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.purchaseCents), cny)}</b>
                      </li>
                    ) : null}
                    {calc.freightCents ? (
                      <li>
                        <span>{t("海运费")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.freightCents), cny)}</b>
                      </li>
                    ) : null}
                    {calc.insuranceCents ? (
                      <li>
                        <span>{t("保险费")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.insuranceCents), cny)}</b>
                      </li>
                    ) : null}
                    {calc.localCents ? (
                      <li>
                        <span>{t("出口国内费用")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.localCents), cny)}</b>
                      </li>
                    ) : null}
                    {calc.bankCents ? (
                      <li>
                        <span>{t("银行手续费")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.bankCents), cny)}</b>
                      </li>
                    ) : null}
                    {calc.destCents ? (
                      <li>
                        <span>{t("目的港清关+关税")}</span>
                        <b className="num">−{formatMoney(centsToYuan(calc.destCents), cny)}</b>
                      </li>
                    ) : null}
                    <li className="sum">
                      <span>{t("利润")}</span>
                      <b className="num" style={{ color: calc.profitCents < 0 ? "var(--coral)" : "var(--jade)" }}>
                        {formatMoney(centsToYuan(calc.profitCents), cny)}
                      </b>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="card qsolve">
                <header className="card-head">
                  <h3>{t("反算：想赚多少，该报多少")}</h3>
                </header>
                <div className="card-body">
                  <label className="qp">
                    <span>{t("目标利润率")}</span>
                    <Num value={q.calc.targetMarginBp / 100} onChange={(v) => patchCalc(q.id, { targetMarginBp: Math.round(v * 100) })} step={0.5} suffix="%" width={84} label={t("目标利润率")} />
                  </label>
                  <input
                    className="qslider"
                    type="range"
                    min={-5}
                    max={45}
                    step={0.5}
                    value={q.calc.targetMarginBp / 100}
                    onChange={(e) => patchCalc(q.id, { targetMarginBp: Math.round(Number(e.target.value) * 100) })}
                    aria-label={t("目标利润率")}
                  />
                  {targetTotal > 0 ? (
                    <>
                      <div className="qsolve-out">
                        <div>
                          <span className="qv-k">{t("该报总价")}</span>
                          <span className="qv-v num">{formatMoney(centsToYuan(targetTotal), sym)}</span>
                        </div>
                        <div>
                          <span className="qv-k">{t("比现价")}</span>
                          <span className="qv-v num" style={{ color: gapPct > 0 ? "var(--jade)" : "var(--coral)" }}>
                            {gapPct >= 0 ? "+" : ""}
                            {gapPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <ul className="qsug">
                        {lines.map((l, i) => (
                          <li key={l.id}>
                            <span className="truncate">{l.name}</span>
                            <span className="num muted">{(l.unitPriceE4 / 10_000).toFixed(4)}</span>
                            <Icon name="arrowRight" size={12} />
                            <span className="num strong">{(suggested[i] / 10_000).toFixed(4)}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          applyPrices(q.id, suggested);
                          toast(t("已按目标利润率改写单价"));
                        }}
                      >
                        <Icon name="check" size={13} />
                        {t("应用到明细行")}
                      </button>
                    </>
                  ) : (
                    <p className="qsolve-nope">{t("这个目标利润率做不到 —— 光成本就超过了")}</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="qhist">
            {history.length <= 1 ? (
              <p className="muted qhist-one">{t("只有一版。客户还价之后点「开新一版」，这里会排出让价轨迹。")}</p>
            ) : null}
            <ol className="qhist-list">
              {history.map((h) => (
                <li key={h.id} data-cur={h.id === q.id ? "1" : undefined}>
                  <span className="qh-v">v{h.version}</span>
                  <div className="qh-main">
                    <div className="qh-row">
                      <b className="num">{formatMoney(centsToYuan(h.totalCents), sym)}</b>
                      <Pill tone={h.marginBp < 1100 ? "amber" : "jade"} dot={false}>
                        {(h.marginBp / 100).toFixed(2)}%
                      </Pill>
                      {h.deltaBp ? (
                        <span className="qh-delta" data-dir={h.deltaBp < 0 ? "down" : "up"}>
                          {h.deltaBp < 0 ? "▼" : "▲"} {Math.abs(h.deltaBp / 100).toFixed(2)}pt
                        </span>
                      ) : null}
                      <span className="spacer" />
                      <span className="muted">{shortDate(h.createdAt)}</span>
                    </div>
                    {h.revisionNote ? <p className="qh-note">{h.revisionNote}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {tab === "files" ? <Attachments entity="quote" entityId={q.id} label={`${q.quoteNo} v${q.version}`} /> : null}
      </Drawer>

      <Modal
        open={revising}
        title={t("开新一版")}
        onClose={() => setRevising(false)}
        footer={
          <>
            <button className="btn" onClick={() => setRevising(false)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                reviseQuote(actor, q.id, revNote);
                setRevising(false);
                setRevNote("");
                toast(t("已开出第 {n} 版", { n: q.version + 1 }));
              }}
            >
              {t("开出 v{n}", { n: history.length + 1 })}
            </button>
          </>
        }
      >
        <p className="modal-lead">{t("整张单连同明细复制一份，旧版本原样留着 —— 让价轨迹要靠它们才看得出这单是怎么谈下来的。")}</p>
        <label className="field">
          <span>{t("这一版为什么让价")}</span>
          <Text value={revNote} onChange={setRevNote} label={t("让价理由")} />
          <span className="field-hint">{t("例：客户加量到 12 万，按阶梯价重报")}</span>
        </label>
      </Modal>

      <Modal
        open={converting}
        title={t("转成 PI")}
        onClose={() => setConverting(false)}
        footer={
          <>
            <button className="btn" onClick={() => setConverting(false)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const r = convertToPi(actor, q.id, piNo);
                if (!r.ok) {
                  toastError(r.error);
                  return;
                }
                setConverting(false);
                toast(t("已生成 {no}，明细行整行搬过去了", { no: piNo }));
              }}
            >
              {t("确认生成")}
            </button>
          </>
        }
      >
        <p className="modal-lead">{t("{n} 行明细会整行搬到 PI 上（含 HS 编码和包装），PI 金额取明细行合计 {amt}。", { n: lines.length, amt: formatMoney(centsToYuan(calc.revenueCents), sym) })}</p>
        <label className="field">
          <span>{t("PI 号")}</span>
          <Text value={piNo} onChange={setPiNo} label={t("PI 号")} />
          <span className="field-hint">{t("按号段规则自动取的，也可以自己改")}</span>
        </label>
      </Modal>
    </>
  );
}

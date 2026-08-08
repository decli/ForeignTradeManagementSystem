/**
 * PI 详情：商品明细 / 一单到底 / 附件，以及「生成单据」的入口。
 *
 * ── 为什么明细行编辑放在这里，而不是取号弹窗里 ──
 * 取号是一个动作（拿个号、挂上客户），明细是慢慢补的：
 * 客户确认规格、工厂回包装参数，往往隔好几天。
 * 把明细塞进取号弹窗，等于逼业务员在信息不全的时候先编几个数。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import { Drawer } from "@/components/ui/Drawer";
import { KV, Pill } from "@/components/ui/bits";
import { Attachments } from "@/components/Attachments";
import { OrderTimeline } from "@/components/OrderTimeline";
import { DocSheet } from "@/components/DocSheet";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { addPiLine, patchPiLine, removePiLine, setPiExt } from "@/data/mutations";
import { lineAmount, lineCartons } from "@/data/types";
import { ShipProgress } from "@/components/ShipProgress";
import { PaymentPlan } from "@/components/PaymentPlan";
import { canSeeCost } from "@/lib/perms";
import { packSummary } from "@/lib/quote-calc";
import { unitEn } from "@/lib/docs";
import { CC_BY_COUNTRY } from "@/lib/geo";
import { centsToYuan, formatInt, formatMoney, shortDate } from "@/lib/format";
import { useTextField } from "@/lib/hooks";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };

function Num({ value, onChange, step = 1, digits = 2, width = 92, label, suffix }: { value: number; onChange: (v: number) => void; step?: number; digits?: number; width?: number; label: string; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="numin" style={{ width }}>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        value={draft ?? String(Number(value.toFixed(digits)))}
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

function Text({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const f = useTextField(value, onChange);
  return (
    <input className="input" value={f.value} onChange={f.onChange} onCompositionStart={f.onCompositionStart} onCompositionEnd={f.onCompositionEnd} aria-label={label} />
  );
}

export function PiDrawer({ piId, onClose }: { piId: string | null; onClose: () => void }) {
  const db = useDb();
  const { user, can } = useAuth();
  const { t, lang } = useT();
  const [tab, setTab] = useState("lines");
  const [printing, setPrinting] = useState(false);
  const seeCost = canSeeCost(user);
  const readOnly = !can("write");

  const pi = piId ? db.pis.find((p) => p.id === piId) ?? null : null;
  const lines = useMemo(() => (pi ? db.piLines.filter((l) => l.piId === pi.id).sort((a, b) => a.seq - b.seq) : []), [db, pi]);
  const pack = useMemo(() => packSummary(lines), [lines]);

  if (!pi) return null;

  const cust = db.customers.find((c) => c.id === pi.customerId);
  const sym = SYM[pi.currency] ?? "$";
  const total = lines.reduce((s, l) => s + lineAmount(l), 0);
  const costTotal = lines.reduce((s, l) => s + Math.round((l.qty * l.costE4) / 100), 0);
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const shipmarkField = db.flow.customFields.find((f) => f.entity === "pi" && f.key === "shipmark");

  return (
    <>
      <Drawer
        open
        storageKey="mt.drawer.pi"
        defaultWidth={900}
        title={
          <span className="dr-title">
            <span className="num">{pi.piNo}</span>
            <Pill tone={pi.status === "closed" ? "jade" : pi.status === "archived" ? "mute" : "accent"}>
              {pi.status === "closed" ? t("已完结") : pi.status === "archived" ? t("已归档") : t("进行中")}
            </Pill>
          </span>
        }
        subtitle={
          <span className="dr-sub">
            <Flag cc={CC_BY_COUNTRY[cust?.country ?? ""]} />
            {cust?.name ?? "—"} · {shortDate(pi.signedOn)} · {formatMoney(centsToYuan(pi.amountCents), sym)}
          </span>
        }
        onClose={onClose}
        tabs={[
          { key: "lines", label: t("商品明细 {n}", { n: lines.length }) },
          { key: "flow", label: t("一单到底") },
          { key: "files", label: t("附件") },
        ]}
        tab={tab}
        onTab={setTab}
        footer={
          <>
            <span className="muted">
              {t("合计")} <b className="num">{formatMoney(centsToYuan(total), sym)}</b>
              {seeCost && costTotal ? (
                <>
                  {" · "}
                  {t("采购")} <b className="num">{formatMoney(centsToYuan(costTotal), "¥")}</b>
                </>
              ) : null}
            </span>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => setPrinting(true)} disabled={!lines.length} data-tip={lines.length ? undefined : t("先补明细行")}>
              <Icon name="file" size={14} />
              {t("生成单据")}
            </button>
          </>
        }
      >
        {tab === "lines" ? (
          <div className="qd">
            <div className="kvs">
              <KV k={t("客户")} v={cust?.name ?? "—"} />
              <KV k={t("目的国")} v={pi.destination ?? "—"} />
              <KV k={t("开票主体")} v={db.sellerEntities.find((e) => e.id === pi.sellerEntityId)?.name ?? "—"} />
              <KV k={t("业务员")} v={db.users.find((u) => u.id === pi.salesId)?.name ?? "—"} />
              {shipmarkField ? (
                <KV
                  k={t(shipmarkField.label)}
                  v={readOnly ? pi.ext?.shipmark ?? "—" : <Text value={pi.ext?.shipmark ?? ""} onChange={(v) => setPiExt(pi.id, "shipmark", v)} label={t(shipmarkField.label)} />}
                />
              ) : null}
            </div>

            <div className="qline-wrap">
              <table className="qline">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>#</th>
                    <th>{t("品名")}</th>
                    <th style={{ width: 96 }}>{t("数量")}</th>
                    <th style={{ width: 104 }}>{t("单价")}</th>
                    <th style={{ width: 110 }} className="ar">{t("金额")}</th>
                    {seeCost ? <th style={{ width: 100 }}>{t("采购价")}</th> : null}
                    <th style={{ width: 68 }} className="ar">{t("箱数")}</th>
                    {readOnly ? null : <th style={{ width: 30 }} />}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <p className="att-empty">
                          {t("还没有商品明细。没有明细就生成不了发票和装箱单 —— 装箱单要按明细算箱数，报关要按明细报 HS 编码。")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => (
                      <tr key={l.id}>
                        <td className="muted num">{l.seq}</td>
                        <td>
                          {readOnly ? <div className="strong">{lang === "en" ? l.nameEn || l.name : l.name}</div> : <Text value={lang === "en" ? l.nameEn || l.name : l.name} onChange={(v) => patchPiLine(l.id, lang === "en" ? { nameEn: v } : { name: v })} label={t("品名")} />}
                          <div className="cell-sub">
                            <span className="num">{l.hsCode ?? "—"}</span>
                            <span>·</span>
                            <span>{t("退税 {n}%", { n: (l.refundRateBp / 100).toFixed(0) })}</span>
                            <span>·</span>
                            <span>{t("每箱")} {l.packQty || "—"}</span>
                          </div>
                        </td>
                        <td>
                          {readOnly ? <span className="num">{formatInt(l.qty)}</span> : <Num value={l.qty} onChange={(v) => patchPiLine(l.id, { qty: Math.max(0, Math.round(v)) })} digits={0} width={90} label={t("数量")} suffix={lang === "en" ? unitEn(l.unit) : l.unit} />}
                        </td>
                        <td>
                          {readOnly ? (
                            <span className="num">{(l.unitPriceE4 / 10_000).toFixed(4)}</span>
                          ) : (
                            <Num value={l.unitPriceE4 / 10_000} onChange={(v) => patchPiLine(l.id, { unitPriceE4: Math.round(v * 10_000) })} step={0.0001} digits={4} width={98} label={t("单价")} />
                          )}
                        </td>
                        <td className="ar num strong">{formatMoney(centsToYuan(lineAmount(l)), sym)}</td>
                        {seeCost ? (
                          <td>
                            {readOnly ? (
                              <span className="num">{(l.costE4 / 10_000).toFixed(4)}</span>
                            ) : (
                              <Num value={l.costE4 / 10_000} onChange={(v) => patchPiLine(l.id, { costE4: Math.round(v * 10_000) })} step={0.0001} digits={4} width={94} label={t("采购价")} />
                            )}
                          </td>
                        ) : null}
                        <td className="ar num">{lineCartons(l) || "—"}</td>
                        {readOnly ? null : (
                          <td>
                            <button className="icon-btn danger" onClick={() => removePiLine(actor, l.id)} aria-label={t("删除这一行")} data-tip={t("删除这一行")}>
                              <Icon name="x" size={12} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {lines.length ? (
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="ar muted">{t("合计")}</td>
                      <td className="ar num strong">{formatMoney(centsToYuan(total), sym)}</td>
                      {seeCost ? <td /> : null}
                      <td className="ar num strong">{formatInt(pack.cartons)}</td>
                      {readOnly ? null : <td />}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {readOnly ? null : (
              <div className="qd-add">
                <select className="select select-xs" value="" onChange={(e) => e.target.value && addPiLine(actor, pi.id, e.target.value)} aria-label={t("添加一行")}>
                  <option value="">{t("＋ 从产品库添加一行…")}</option>
                  {db.ops.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {lang === "en" ? (p.nameEn ?? p.name) : p.name}
                    </option>
                  ))}
                </select>
                <button className="link-btn" onClick={() => addPiLine(actor, pi.id, null)}>
                  <Icon name="plus" size={13} />
                  {t("加一行空行")}
                </button>
              </div>
            )}

            {lines.length ? (
              <div className="qd-pack">
                <span>
                  <Icon name="box" size={13} /> {formatInt(pack.cartons)} {t("箱")}
                </span>
                <span>{pack.grossKg.toFixed(0)} kg</span>
                <span>{pack.cbm.toFixed(2)} CBM</span>
                <span>≈ {pack.teu.toFixed(2)} × 20GP</span>
              </div>
            ) : null}

            {/* PI 金额是明细行合计的缓存，两者永远相等。这句话要写在界面上，
                否则用户会以为金额是可以单独改的 */}
            <p className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("PI 金额取明细行合计，改明细会同步改金额 —— 单据上的合计和系统里的金额必须是同一个数。")}
            </p>

            <PaymentPlan pi={pi} readOnly={readOnly} />
            <ShipProgress pi={pi} />
          </div>
        ) : null}

        {tab === "flow" ? <OrderTimeline pi={pi} /> : null}
        {tab === "files" ? <Attachments entity="pi" entityId={pi.id} label={pi.piNo} expect={["合同 / PI", "商业发票", "装箱单", "提单"]} /> : null}
      </Drawer>

      {printing ? <DocSheet pi={pi} onClose={() => setPrinting(false)} /> : null}
    </>
  );
}

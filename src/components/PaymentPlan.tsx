/**
 * PI 的收款计划编辑。
 *
 * ── 界面上要一直说清楚的三件事 ──
 * 1. **比例合计必须是 100%。** 差一点点就意味着有一笔钱不在任何一期里，
 *    那笔钱永远不会有人去催。所以差额实时显示，不够就红着。
 * 2. **事件没发生就没有到期日。** 这一列显示「待开船」而不是一个算出来的
 *    假日期 —— 假日期会污染账龄、催收清单和现金流预测。
 * 3. **哪一期卡放货。** 以前这是备注里手写的一句「待客户付尾款后电放」，
 *    系统不认识，人一交接就漏。
 */

import { Icon } from "@/components/Icon";
import { Pill } from "@/components/ui/bits";
import { toast } from "@/components/ui/Toast";
import { useDb } from "@/data/DataProvider";
import { mutate } from "@/data/db";
import { TERM_TEMPLATES, TRIGGER_LABEL, ratioTotal, resolveTerms, termsOf } from "@/data/payment-terms";
import type { PaymentTerm, PaymentTrigger, Pi } from "@/data/types";
import { centsToYuan, formatMoney, shortDate } from "@/lib/format";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };
const TRIGGERS: PaymentTrigger[] = ["signed", "bl_copy", "bl_original", "atd", "eta", "delivered", "fixed"];

const rid = () => `pt_${Math.random().toString(36).slice(2, 10)}`;

export function PaymentPlan({ pi, readOnly }: { pi: Pi; readOnly: boolean }) {
  const { t } = useT();
  const db = useDb();
  const terms = termsOf(db, pi.id);
  const states = resolveTerms(db, pi);
  const sym = SYM[pi.currency] ?? "$";
  const total = ratioTotal(terms);
  const fixedSum = terms.reduce((s, x) => s + (x.amountCents ?? 0), 0);
  // 指定了金额的期不参与比例校验，剩下的比例要凑满未被金额占走的部分
  const target = pi.amountCents > 0 ? Math.round(((pi.amountCents - fixedSum) / pi.amountCents) * 10_000) : 10_000;
  const gap = target - total;

  const write = (fn: (list: PaymentTerm[]) => PaymentTerm[]) => {
    mutate((d) => {
      const others = d.paymentTerms.filter((x) => x.piId !== pi.id);
      d.paymentTerms = [...others, ...fn(d.paymentTerms.filter((x) => x.piId === pi.id))];
    });
  };

  const applyTemplate = (name: string) => {
    const tpl = TERM_TEMPLATES.find((x) => x.name === name);
    if (!tpl) return;
    write(() => tpl.terms.map((x) => ({ ...x, id: rid(), piId: pi.id })));
    toast(t("已套用「{n}」", { n: name }));
  };

  const patch = (id: string, p: Partial<PaymentTerm>) => write((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => write((list) => list.filter((x) => x.id !== id).map((x, i) => ({ ...x, seq: i + 1 })));
  const add = () =>
    write((list) => [
      ...list,
      { id: rid(), piId: pi.id, seq: list.length + 1, ratioBp: Math.max(0, gap), amountCents: null, trigger: "bl_copy", offsetDays: 0, fixedOn: null, blocksRelease: false, note: null },
    ]);

  return (
    <div className="payplan">
      <div className="payplan-head">
        <b>{t("收款计划")}</b>
        <span className="muted">{t("到期日由触发事件推出来，事件没发生就没有到期日")}</span>
        <span className="spacer" />
        {terms.length ? (
          <Pill tone={gap === 0 ? "jade" : "coral"} dot={false}>
            {gap === 0 ? t("合计 100%") : gap > 0 ? t("还差 {p}%", { p: (gap / 100).toFixed(1) }) : t("超出 {p}%", { p: (-gap / 100).toFixed(1) })}
          </Pill>
        ) : null}
      </div>

      {terms.length === 0 ? (
        <div className="payplan-empty">
          <p>
            {t("这张 PI 还没有收款计划。没有它，应收账龄只能拿客户的默认账期从提单日一刀切 —— 定金那部分一定算错，因为定金是签约就该付的，不是发货后 N 天。")}
          </p>
          {readOnly ? null : (
            <div className="payplan-tpls">
              {TERM_TEMPLATES.map((x) => (
                <button key={x.name} className="btn btn-sm" onClick={() => applyTemplate(x.name)}>
                  {t(x.name)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <ul className="payplan-list">
            {states.map((s, i) => (
              <li key={s.term.id}>
                <span className="payplan-seq">{i + 1}</span>

                {readOnly ? (
                  <span className="payplan-ratio num">{(s.term.ratioBp / 100).toFixed(0)}%</span>
                ) : (
                  <span className="numin payplan-ratio">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={s.term.amountCents == null ? s.term.ratioBp / 100 : ""}
                      disabled={s.term.amountCents != null}
                      aria-label={t("比例")}
                      onChange={(e) => patch(s.term.id, { ratioBp: Math.round(Number(e.target.value) * 100) })}
                    />
                    <i>%</i>
                  </span>
                )}

                <span className="payplan-amt num">{formatMoney(centsToYuan(s.dueCents), sym)}</span>

                {readOnly ? (
                  <span className="payplan-trig">{t(TRIGGER_LABEL[s.term.trigger])}</span>
                ) : (
                  <select
                    className="select select-xs payplan-trig"
                    value={s.term.trigger}
                    aria-label={t("触发事件")}
                    onChange={(e) => patch(s.term.id, { trigger: e.target.value as PaymentTrigger })}
                  >
                    {TRIGGERS.map((x) => (
                      <option key={x} value={x}>
                        {t(TRIGGER_LABEL[x])}
                      </option>
                    ))}
                  </select>
                )}

                {readOnly ? (
                  <span className="payplan-off num">{s.term.offsetDays ? t("+{n} 天", { n: s.term.offsetDays }) : "—"}</span>
                ) : (
                  <span className="numin payplan-off">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={1}
                      value={s.term.offsetDays}
                      aria-label={t("事件后天数")}
                      onChange={(e) => patch(s.term.id, { offsetDays: Math.max(0, Math.round(Number(e.target.value))) })}
                    />
                    <i>{t("天")}</i>
                  </span>
                )}

                {/* 事件没发生就说在等什么，绝不显示一个算出来的假日期 */}
                <span className="payplan-due num">
                  {s.dueOn ? (
                    <>
                      {shortDate(s.dueOn)}
                      {s.overdue != null && s.overdue > 0 ? <em className="payplan-late">{t("逾 {n}", { n: s.overdue })}</em> : null}
                    </>
                  ) : (
                    <span className="muted">{s.pending}</span>
                  )}
                </span>

                <label className="payplan-gate" data-tip={t("这一期不到账就不放单，跟单表上会拦下来")}>
                  <input
                    type="checkbox"
                    checked={s.term.blocksRelease}
                    disabled={readOnly}
                    onChange={(e) => patch(s.term.id, { blocksRelease: e.target.checked })}
                  />
                  <span>{t("卡放货")}</span>
                </label>

                {readOnly ? null : (
                  <button className="icon-btn danger" onClick={() => remove(s.term.id)} aria-label={t("删掉这一期")} data-tip={t("删掉这一期")}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {readOnly ? null : (
            <div className="payplan-foot">
              <button className="btn btn-sm" onClick={add}>
                <Icon name="plus" size={13} />
                {t("加一期")}
              </button>
              <select className="select select-xs" value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} aria-label={t("套用模板")}>
                <option value="">{t("套用模板…")}</option>
                {TERM_TEMPLATES.map((x) => (
                  <option key={x.name} value={x.name}>
                    {t(x.name)}
                  </option>
                ))}
              </select>
              {gap !== 0 ? (
                <span className="payplan-warn">
                  <Icon name="alert" size={12} />
                  {t("比例没凑满 100%，差的那部分不会出现在任何一期里，也就永远不会有人去催")}
                </span>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

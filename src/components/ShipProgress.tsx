/**
 * 一张 PI 的出运进度：每一行订了多少、出了多少、还差多少。
 *
 * ── 为什么单独一块，不做成明细表的一列 ──
 * 明细表已经七八列了，再塞进去哪一列都得挤。而且这两件事看的时机不同：
 * 明细是**签约时**在编的，进度是**跟单时**在盯的。
 *
 * ── 「还差」为什么可以是 0 却还没做完 ──
 * 合同里的溢短装（±5%）允许少装一点就算交付完成。所以判定看的是区间，
 * 不是 `已出 === 订单量`：死磕相等的话，每张单最后都挂着几十件的尾巴，
 * 永远显示"未出完"，跟单员就再也不看这个状态了。
 */

import { Icon } from "@/components/Icon";
import { Pill } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { piShipSummary, type LineProgress } from "@/data/shipment-lines";
import { DEFAULT_MORE_OR_LESS_BP, type Pi } from "@/data/types";
import { formatInt } from "@/lib/format";
import { useT } from "@/i18n";

const TONE: Record<LineProgress["state"], "mute" | "accent" | "jade" | "amber"> = {
  none: "mute",
  partial: "accent",
  done: "jade",
  over: "amber",
};

export function ShipProgress({ pi }: { pi: Pi }) {
  const { t, lang } = useT();
  const db = useDb();
  const s = piShipSummary(db, pi);
  if (!s.rows.length) return null;

  const tolPct = ((pi.moreOrLessBp ?? DEFAULT_MORE_OR_LESS_BP) / 100).toFixed(0);

  const label: Record<LineProgress["state"], string> = {
    none: t("未出"),
    partial: t("部分"),
    done: t("已出完"),
    over: t("超装"),
  };

  return (
    <div className="shipprog">
      <div className="shipprog-head">
        <b>{t("出运进度")}</b>
        <span className="muted">{t("按明细行对账 · 溢短装 ±{n}%", { n: tolPct })}</span>
        <span className="spacer" />
        {s.notStarted ? (
          <Pill tone="mute" dot={false}>{t("还没排批次")}</Pill>
        ) : s.unlogged ? (
          /* 有批次但没登记装了什么。跟"还没出货"是两回事，必须分开说 ——
             老账套升级上来就是这个状态，混为一谈会让人以为货还在厂里 */
          <Pill tone="amber" dot={false}>{t("{n} 个批次未登记内容", { n: String(s.batches) })}</Pill>
        ) : (
          <Pill tone={s.anyOver ? "amber" : s.allDone ? "jade" : "accent"} dot={false}>
            {s.allDone ? t("已出完") : t("已出 {p}%", { p: (s.ratio * 100).toFixed(0) })}
          </Pill>
        )}
      </div>

      {s.unlogged ? (
        <p className="shipprog-note">
          <Icon name="info" size={13} />
          {t("这张 PI 有 {n} 个出运批次，但没有登记每批装了什么。不登记的话，按批次开的商业发票和装箱单只能按整票数量出 —— 那个数拿去清关是错的。", { n: String(s.batches) })}
        </p>
      ) : null}

      <ul className="shipprog-list">
        {s.rows.map((r) => (
          <li key={r.piLine.id} data-state={r.state}>
            <span className="shipprog-name truncate">{lang === "en" ? r.piLine.nameEn || r.piLine.name : r.piLine.name}</span>
            <span className="shipprog-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, r.ratio * 100).toFixed(1)}%` }} />
            </span>
            <span className="shipprog-num num">
              {formatInt(r.shipped)} <em>/ {formatInt(r.ordered)}</em>
            </span>
            {/* 多装少装都要显式写出来。落在溢短装区间内算「已出完」，
                但差了多少是事实 —— 之前这里显示「—」，等于把 1613 件的溢装藏了起来 */}
            <span className="shipprog-rest num" data-over={r.shipped > r.ordered ? "1" : "0"}>
              {r.shipped > r.ordered
                ? t("溢 {n}", { n: formatInt(r.shipped - r.ordered) })
                : r.remaining > 0
                  ? t("待出 {n}", { n: formatInt(r.remaining) })
                  : t("正好")}
            </span>
            <Pill tone={TONE[r.state]} dot={false}>
              {label[r.state]}
            </Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

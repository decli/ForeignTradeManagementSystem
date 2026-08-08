import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { PickList } from "@/components/shell/PickList";
import { useDb } from "@/data/DataProvider";
import { customRate, marketRate } from "@/data/queries";
import { useStored } from "@/lib/hooks";
import { CURRENCIES, DEFAULT_WATCH, FX_INTERVALS, findCurrency, fxDigits, quote } from "@/lib/fx";
import { useT } from "@/i18n";

/**
 * 汇率牌。
 *
 * 顶栏只放**第一条**盯的牌价 —— 一个数，看一眼就走。鼠标停上去自动展开全表，
 * 不用为了瞄一眼报价点两次（点开、再点关）。面板里能加减币种、改刷新节奏。
 *
 * 「自定」只在第一条是 USD 时才跟着显示：自定汇率是 USD→CNY 的核算基准，
 * 摆在一个欧元报价旁边会被读成「欧元的自定价」。
 *
 * 数据来源和接真行情的位置见 `src/lib/fx.ts`。
 */
export function FxRates() {
  const db = useDb();
  const { t, lang } = useT();
  const [watch, setWatch] = useStored<string[]>("mt.fx.watch", DEFAULT_WATCH);
  const [every, setEvery] = useStored<number>("mt.fx.every", 60);
  const [adding, setAdding] = useState(false);
  /** 刷新计数。牌价是它的函数，加一就是刷一次 */
  const [tick, setTick] = useState(0);
  const [at, setAt] = useState(() => new Date());

  const usdCny = marketRate(db);
  const custom = customRate(db);

  useEffect(() => {
    if (!every) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      setAt(new Date());
    }, every * 1000);
    return () => clearInterval(id);
  }, [every]);

  const rows = useMemo(() => quote(watch, usdCny, tick), [watch, usdCny, tick]);
  const first = rows[0];

  const refresh = () => {
    setTick((n) => n + 1);
    setAt(new Date());
  };

  const fmt = (v: number) => v.toFixed(fxDigits(v));
  const clock = at.toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour12: false });

  return (
    <Menu
      hover
      align="end"
      width={330}
      trigger={(p) => (
        <button className="fx" {...p} ref={p.ref} aria-label={t("汇率牌价")}>
          <i className="fx-live" />
          {first ? (
            <>
              <span className="k">{first.code}</span>
              <b>{fmt(first.cny)}</b>
              {/* 自定汇率是核算基准，不是行情 —— 只有第一条是 USD 时才跟着显示，
                  摆在一个欧元报价旁边会被读成「欧元的自定价」。
                  顶栏挤起来（≤1080px）时它先让位，牌价留到最后。 */}
              {first.code === "USD" ? (
                <span className="fx-mine">
                  <span className="sep" />
                  <span className="k">{t("自定")}</span>
                  <b>{custom.toFixed(4)}</b>
                </span>
              ) : null}
            </>
          ) : (
            <span className="k">{t("汇率")}</span>
          )}
        </button>
      )}
    >
      {() =>
        adding ? (
          <PickList
            title={t("添加币种")}
            placeholder={t("搜代码或名称…")}
            onBack={() => setAdding(false)}
            items={CURRENCIES.filter((c) => !watch.includes(c.code)).map((c) => ({ ...c, key: c.code }))}
            text={(c) => [c.code, c.zh, c.en]}
            onPick={(c) => {
              setWatch([...watch, c.code]);
              setAdding(false);
            }}
            render={(c) => (
              <>
                <span className="pick-code">{c.code}</span>
                <span className="truncate">{lang === "en" ? c.en : c.zh}</span>
                <span className="spacer" />
                <span className="pick-hint num">{fmt(c.usd * usdCny)}</span>
              </>
            )}
          />
        ) : (
          <div className="fxp">
            <header className="fxp-head">
              <b>{t("汇率牌价")}</b>
              <span className="muted">{t("兑人民币")}</span>
              <span className="spacer" />
              <select
                className="select select-xs"
                value={every}
                onChange={(e) => setEvery(Number(e.target.value))}
                aria-label={t("刷新频率")}
                data-tip={t("刷新频率")}
              >
                {FX_INTERVALS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={refresh} data-tip={t("立即刷新")} aria-label={t("立即刷新")}>
                <Icon name="refresh" />
              </button>
            </header>

            <div className="fxp-rows">
              {rows.length === 0 ? (
                <p className="fxp-empty">{t("一个币种都没盯。点下面「添加币种」。")}</p>
              ) : (
                rows.map((r) => {
                  const c = findCurrency(r.code)!;
                  const bp = ((r.cny - r.prev) / r.prev) * 10_000;
                  const dir = bp > 0.5 ? "up" : bp < -0.5 ? "down" : "flat";
                  return (
                    <div className="fxp-row" key={r.code}>
                      <span className="fxp-code">
                        {r.per > 1 ? <i>{r.per}</i> : null}
                        {r.code}
                      </span>
                      <span className="truncate">{lang === "en" ? c.en : c.zh}</span>
                      <b className="num">{fmt(r.cny)}</b>
                      {/* 红涨绿跌是中文金融界面的默认读法，但颜色不能是唯一的通道 ——
                          它跟站内「珊瑚=有问题」的语义正好撞车，色觉障碍的人也读不出。
                          所以方向由箭头说，颜色只是加强。 */}
                      <span className="fxp-delta" data-dir={dir}>
                        {dir === "flat" ? "—" : `${dir === "up" ? "▲" : "▼"} ${Math.abs(bp / 100).toFixed(2)}%`}
                      </span>
                      <button
                        className="row-x"
                        onClick={() => setWatch(watch.filter((w) => w !== r.code))}
                        data-tip={t("不再盯它")}
                        aria-label={t("移除 {code}", { code: r.code })}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* 自定汇率不是行情，是核算基准 —— 单独一行，跟牌价之间画条线分开 */}
            <div className="fxp-custom">
              <span>{t("自定 USD → CNY")}</span>
              <b className="num">{custom.toFixed(4)}</b>
              <span className="muted">{t("核算用")}</span>
            </div>

            <footer className="fxp-foot">
              <button className="link-btn" onClick={() => setAdding(true)}>
                <Icon name="plus" size={13} />
                {t("添加币种")}
              </button>
              <span className="spacer" />
              <span>{every ? t("{time} 更新", { time: clock }) : t("手动刷新")}</span>
            </footer>
            <p className="fxp-note">{t("演示行情：以账套里的市场汇率为锚推算，不联网。")}</p>
          </div>
        )
      }
    </Menu>
  );
}

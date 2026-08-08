/**
 * 空账套引导。
 *
 * ── 为什么是清单，不是向导 ──
 * 模态向导要求人一口气走完：跳不过、退不回、中途关掉进度还得自己记。
 * 而这四步现实中是跨天的 —— 主体资料要找财务要，产品表要从工厂那边导。
 * 清单可以搁在那儿，做一件勾一件，什么时候回来都看得见还差什么。
 *
 * ── 四步是依赖顺序，不是推荐顺序 ──
 * 每一条都写清"不做会怎样"（见 empty.ts 的 why）。
 * 空泛的「完善基础资料」没人会点；「不建就一张单据也开不出来」才会。
 *
 * ── 什么时候消失 ──
 * 四步做完自动消失，不需要用户去关。做完了还杵在那儿的引导是噪音。
 */

import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useDb } from "@/data/DataProvider";
import { SETUP_STEPS, setupProgress } from "@/data/empty";
import { isDemo } from "@/data/profile";
import { useT } from "@/i18n";

export function SetupGuide() {
  const { t } = useT();
  const db = useDb();

  // 演示账套里这些当然都是齐的，引导没有意义
  if (isDemo()) return null;
  const done = setupProgress(db);
  if (done === SETUP_STEPS.length) return null;

  return (
    <section className="setup">
      <div className="setup-head">
        <div>
          <h2>{t("把系统跑起来，还差 {n} 步", { n: String(SETUP_STEPS.length - done) })}</h2>
          <p>{t("按顺序来 —— 后面几步要用到前面建的资料。做完这一条会自己勾上。")}</p>
        </div>
        <div className="setup-count" aria-label={t("已完成 {a}/{b}", { a: String(done), b: String(SETUP_STEPS.length) })}>
          <b>{done}</b>
          <span>/ {SETUP_STEPS.length}</span>
        </div>
      </div>

      <ol className="setup-list">
        {SETUP_STEPS.map((s, i) => {
          const ok = s.done(db);
          // 第一个没做的才是"该做的那个"，其余的先压暗，避免四条一样亮
          const next = !ok && SETUP_STEPS.slice(0, i).every((p) => p.done(db));
          return (
            <li key={s.key} data-done={ok ? "1" : "0"} data-next={next ? "1" : "0"}>
              <span className="setup-dot" aria-hidden="true">
                {ok ? <Icon name="check" size={13} /> : i + 1}
              </span>
              <div className="setup-main">
                <b>{t(s.title)}</b>
                <small>{t(s.why)}</small>
              </div>
              {ok ? (
                <span className="setup-ok">{t("已完成")}</span>
              ) : (
                <Link className={next ? "btn btn-primary" : "btn"} to={s.href}>
                  {t("去设置")}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

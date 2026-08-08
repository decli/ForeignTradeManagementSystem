import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { WorldClocks } from "@/components/shell/WorldClocks";
import { useDb } from "@/data/DataProvider";
import { customRate, marketRate } from "@/data/queries";
import { useTick } from "@/lib/hooks";
import { breadcrumb, navTitle } from "@/lib/nav";
import { ACCENTS, useAccent, useDensity, useThemeCycle, type Density, type Theme } from "@/lib/theme";
import { useT } from "@/i18n";

export function Topbar({ onOpenPalette, onOpenNav }: { onOpenPalette: () => void; onOpenNav: () => void }) {
  const db = useDb();
  const { pathname } = useLocation();
  const crumb = breadcrumb(pathname);
  const { t, lang } = useT();
  useTick(30_000);

  const fx = useMemo(() => ({ market: marketRate(db), custom: customRate(db) }), [db]);

  return (
    <header className="topbar">
      {/* 只在窄屏出现，显隐交给 CSS —— 用 JS 改 display 会跟 React 的渲染抢同一个节点 */}
      <button className="icon-btn nav-toggle" onClick={onOpenNav} aria-label={t("打开导航")}>
        <Icon name="panel" />
      </button>

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/dashboard" className="muted" style={{ color: "inherit" }}>
          {t(crumb.group)}
        </Link>
        <Icon name="chevronRight" />
        <b className="truncate">{crumb.item ? navTitle(crumb.item, lang) : t(crumb.title)}</b>
      </nav>

      <span className="spacer" />

      <div className="fx" data-tip={`${t("市场")} ${fx.market} · ${t("自定")} ${fx.custom}`}>
        <i className="fx-live" />
        <span className="k">{t("市场")}</span>
        <b>{fx.market.toFixed(4)}</b>
        <span className="sep" />
        <span className="k">{t("自定")}</span>
        <b>{fx.custom.toFixed(4)}</b>
      </div>

      <WorldClocks />

      {/* 右侧控件成组。散着放会有两个后果：
          一是顶栏 12px 的 gap 让它们看着像三件不相干的东西；
          二是一旦时钟被隐藏（≤640px）或内容变短，它们就跟着往左飘 ——
          之前正好是「时钟宽度刚好填满」才看着靠右，是巧合不是布局。 */}
      <div className="topbar-acts">
        <button className="icon-btn" onClick={onOpenPalette} data-tip={`${t("搜索")} · ⌘K`} aria-label={t("全局搜索")}>
          <Icon name="search" />
        </button>
        <LangButton />
        <AppearanceMenu />
      </div>
    </header>
  );
}

const THEME_OPTS: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "浅色", icon: "sun" },
  { value: "dark", label: "深色", icon: "moon" },
  { value: "system", label: "跟随", icon: "monitor" },
];

const DENSITY_OPTS: { value: Density; label: string }[] = [
  { value: "compact", label: "紧凑" },
  { value: "default", label: "标准" },
  { value: "cozy", label: "宽松" },
];

/**
 * 外观：明暗 + 主题色 + 表格密度，一个入口。
 *
 * 原来明暗和密度各占一个顶栏按钮，加主题色就是第三个 —— 三个只在装修时用一次
 * 的开关，天天占着顶栏最右边那块地方。合成一个之后顶栏从四个控件降到三个，
 * 顺带给世界时间腾出了位置。
 *
 * 里面用三排分段器而不是三个二级菜单：这三项都是「少数几个互斥选项」，
 * 摊开来当前值一眼就看见，也不用为了看一眼现在是哪档而多点一次。
 */
function AppearanceMenu() {
  const { theme, setTheme } = useThemeCycle();
  const [accent, setAccent] = useAccent();
  const [density, setDensity] = useDensity();
  const { t } = useT();

  return (
    <Menu
      align="end"
      width={244}
      trigger={(p) => (
        <button className="icon-btn" {...p} ref={p.ref} data-tip={t("外观")} aria-label={t("外观")}>
          <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
        </button>
      )}
    >
      {() => (
        <div className="appearance">
          <div className="pop-title">{t("明暗")}</div>
          <div className="seg seg-fill" role="group" aria-label={t("明暗")}>
            {THEME_OPTS.map((o) => (
              <button key={o.value} aria-pressed={theme === o.value} onClick={() => setTheme(o.value)}>
                <Icon name={o.icon} size={14} />
                {t(o.label)}
              </button>
            ))}
          </div>

          <div className="pop-title">{t("主题色")}</div>
          <div className="swatches" role="group" aria-label={t("主题色")}>
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                className="swatch"
                style={{ ["--sw" as string]: a.sw, ["--sw2" as string]: a.swDark }}
                aria-pressed={accent === a.value}
                aria-label={t(a.label)}
                data-tip={`${t(a.label)} · ${t(a.desc)}`}
                onClick={() => setAccent(a.value)}
              />
            ))}
          </div>
          <p className="appearance-note">{t(ACCENTS.find((a) => a.value === accent)?.label ?? "")}</p>

          <div className="pop-title">{t("表格密度")}</div>
          <div className="seg seg-fill" role="group" aria-label={t("表格密度")}>
            {DENSITY_OPTS.map((o) => (
              <button key={o.value} aria-pressed={density === o.value} onClick={() => setDensity(o.value)}>
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

/** 中英切换：一个按钮，不做下拉 —— 只有两种语言，多一层菜单是多一次点击 */
function LangButton() {
  const { lang, toggle, t } = useT();
  return (
    <button
      className="icon-btn lang-btn"
      onClick={toggle}
      data-tip={t("切换语言")}
      aria-label={`${t("切换语言")} · ${lang === "zh" ? "English" : "中文"}`}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );
}

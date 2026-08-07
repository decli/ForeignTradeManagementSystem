import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { useDb } from "@/data/DataProvider";
import { customRate, marketRate } from "@/data/queries";
import { useTick } from "@/lib/hooks";
import { localClock } from "@/lib/format";
import { breadcrumb, navTitle } from "@/lib/nav";
import { useDensity, useThemeCycle, type Density } from "@/lib/theme";
import { useT } from "@/i18n";

/** 顶栏跟着的城市：厦门是自己，其余是客户密集的时区 */
const CITIES = [
  { name: "厦门", en: "Xiamen", tz: "Asia/Shanghai", home: true },
  { name: "利马", en: "Lima", tz: "America/Lima" },
  { name: "纽约", en: "New York", tz: "America/New_York" },
  { name: "布宜诺斯艾利斯", en: "Buenos Aires", tz: "America/Argentina/Buenos_Aires" },
  { name: "伦敦", en: "London", tz: "Europe/London" },
  { name: "迪拜", en: "Dubai", tz: "Asia/Dubai" },
];

export function Topbar({ onOpenPalette, onOpenNav }: { onOpenPalette: () => void; onOpenNav: () => void }) {
  const db = useDb();
  const { pathname } = useLocation();
  const crumb = breadcrumb(pathname);
  const { t, lang } = useT();
  useTick(30_000);

  const fx = useMemo(() => ({ market: marketRate(db), custom: customRate(db) }), [db]);
  const clocks = useMemo(() => CITIES.map((c) => ({ ...c, clock: localClock(c.tz) })), []);

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

      <div className="clocks" aria-label={t("世界时间")}>
        {clocks.map((c) => (
          <span
            key={c.name}
            className="clock"
            data-home={c.home ? "1" : "0"}
            data-working={c.clock?.working ? "1" : "0"}
            data-tip={`${c.name} ${c.clock?.time ?? ""} · ${t(c.clock?.working ? "对方在上班" : "对方多半不在")}`}
          >
            <i />
            {lang === "en" ? c.en : c.name} <b>{c.clock?.time ?? "--:--"}</b>
          </span>
        ))}
      </div>

      {/* 四个控件成组。散着放会有两个后果：
          一是顶栏 12px 的 gap 让它们看着像四件不相干的东西；
          二是一旦时钟被隐藏（≤640px）或内容变短，它们就跟着往左飘 ——
          之前正好是「时钟宽度刚好填满」才看着靠右，是巧合不是布局。 */}
      <div className="topbar-acts">
        <button className="icon-btn" onClick={onOpenPalette} data-tip={`${t("搜索")} · ⌘K`} aria-label={t("全局搜索")}>
          <Icon name="search" />
        </button>
        <LangButton />
        <DensityMenu />
        <ThemeButton />
      </div>
    </header>
  );
}

function ThemeButton() {
  const { theme, cycle } = useThemeCycle();
  const { t } = useT();
  const label = t(theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统");
  return (
    <button className="icon-btn" onClick={cycle} data-tip={`${t("外观")}：${label}`} aria-label={`${t("切换外观")} · ${label}`}>
      <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
    </button>
  );
}

const DENSITY_OPTS: { value: Density; label: string; desc: string }[] = [
  { value: "compact", label: "紧凑", desc: "一屏塞下更多行" },
  { value: "default", label: "标准", desc: "默认" },
  { value: "cozy", label: "宽松", desc: "看着不累" },
];

function DensityMenu() {
  const [density, setDensity] = useDensity();
  const { t } = useT();
  return (
    <Menu
      align="end"
      width={200}
      trigger={(p) => (
        <button className="icon-btn" {...p} ref={p.ref} data-tip={t("表格密度")} aria-label={t("表格密度")}>
          <Icon name="layout" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pop-title">{t("表格密度")}</div>
          {DENSITY_OPTS.map((o) => (
            <button
              key={o.value}
              className="pop-item"
              data-active={density === o.value ? "1" : "0"}
              onClick={() => {
                setDensity(o.value);
                close();
              }}
            >
              <span style={{ width: 15 }}>{density === o.value ? <Icon name="check" size={15} /> : null}</span>
              <span>{t(o.label)}</span>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t(o.desc)}</span>
            </button>
          ))}
        </>
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

import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { useDb } from "@/data/DataProvider";
import { customRate, marketRate } from "@/data/queries";
import { useTick } from "@/lib/hooks";
import { localClock } from "@/lib/format";
import { breadcrumb } from "@/lib/nav";
import { useDensity, useThemeCycle, type Density } from "@/lib/theme";

/** 顶栏跟着的城市：厦门是自己，其余是客户密集的时区 */
const CITIES = [
  { name: "厦门", tz: "Asia/Shanghai", home: true },
  { name: "利马", tz: "America/Lima" },
  { name: "纽约", tz: "America/New_York" },
  { name: "布宜诺斯艾利斯", tz: "America/Argentina/Buenos_Aires" },
  { name: "伦敦", tz: "Europe/London" },
  { name: "迪拜", tz: "Asia/Dubai" },
];

export function Topbar({ onOpenPalette, onOpenNav }: { onOpenPalette: () => void; onOpenNav: () => void }) {
  const db = useDb();
  const { pathname } = useLocation();
  const crumb = breadcrumb(pathname);
  useTick(30_000);

  const fx = useMemo(() => ({ market: marketRate(db), custom: customRate(db) }), [db]);
  const clocks = useMemo(() => CITIES.map((c) => ({ ...c, clock: localClock(c.tz) })), []);

  return (
    <header className="topbar">
      {/* 只在窄屏出现，显隐交给 CSS —— 用 JS 改 display 会跟 React 的渲染抢同一个节点 */}
      <button className="icon-btn nav-toggle" onClick={onOpenNav} aria-label="打开导航">
        <Icon name="panel" />
      </button>

      <nav className="crumbs" aria-label="面包屑">
        <Link to="/dashboard" className="muted" style={{ color: "inherit" }}>
          {crumb.group}
        </Link>
        <Icon name="chevronRight" />
        <b className="truncate">{crumb.title}</b>
      </nav>

      <span className="spacer" />

      <div className="fx" title={`市场汇率 ${fx.market} · 自定汇率 ${fx.custom}（订单折算用自定汇率）`}>
        <i className="fx-live" />
        <span className="k">市场</span>
        <b>{fx.market.toFixed(4)}</b>
        <span className="sep" />
        <span className="k">自定</span>
        <b>{fx.custom.toFixed(4)}</b>
      </div>

      <div className="clocks" aria-label="世界时间">
        {clocks.map((c) => (
          <span
            key={c.name}
            className="clock"
            data-home={c.home ? "1" : "0"}
            data-working={c.clock?.working ? "1" : "0"}
            title={`${c.name} ${c.clock?.weekday ?? ""} ${c.clock?.time ?? ""}${c.clock?.working ? " · 对方在上班" : " · 对方多半不在"}`}
          >
            <i />
            {c.name} <b>{c.clock?.time ?? "--:--"}</b>
          </span>
        ))}
      </div>

      <button className="icon-btn" onClick={onOpenPalette} data-tip="搜索 · ⌘K" aria-label="全局搜索">
        <Icon name="search" />
      </button>

      <DensityMenu />
      <ThemeButton />
    </header>
  );
}

function ThemeButton() {
  const { theme, cycle } = useThemeCycle();
  const label = theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统";
  return (
    <button className="icon-btn" onClick={cycle} data-tip={`外观：${label}`} aria-label={`切换外观，当前${label}`}>
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
  return (
    <Menu
      align="end"
      width={200}
      trigger={(p) => (
        <button className="icon-btn" {...p} ref={p.ref} data-tip="表格密度" aria-label="表格密度">
          <Icon name="layout" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pop-title">表格密度</div>
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
              <span>{o.label}</span>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{o.desc}</span>
            </button>
          ))}
        </>
      )}
    </Menu>
  );
}

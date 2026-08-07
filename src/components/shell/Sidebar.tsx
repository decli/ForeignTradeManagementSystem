import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui/bits";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listShipments } from "@/data/queries";
import { useDragResize, useStored } from "@/lib/hooks";
import { NAV, navHref } from "@/lib/nav";

/**
 * 侧栏。
 *
 * 展开态可以拖宽度（200–360，记住），可以整组折叠，可以把常用模块钉到顶上；
 * 收起态变成 64px 图标轨，hover 出气泡认路。窄屏由外层切成浮层。
 */
export function Sidebar({
  collapsed,
  onToggle,
  onOpenPalette,
  onNavigate,
  onOpenUserMenu,
  width,
  onWidth,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
  onNavigate: () => void;
  onOpenUserMenu: (el: HTMLElement) => void;
  width: number;
  onWidth: (w: number) => void;
}) {
  const db = useDb();
  const { user, viewer, displayName, picture } = useAuth();
  const { pathname } = useLocation();
  const [closedGroups, setClosedGroups] = useStored<string[]>("mt.rail.closed", []);
  const [pinned, setPinned] = useStored<string[]>("mt.rail.pinned", ["follow-ups", "dashboard"]);
  const { dragging, onPointerDown } = useDragResize(() => width, onWidth, { min: 200, max: 380 });

  // 侧栏上的角标要跟看板对得上：都从同一个查询来
  const counts = useMemo(() => {
    const rows = listShipments(db, viewer, {});
    return {
      "follow-ups": rows.filter((r) => r.stalledDays || r.hasLate).length,
      "tax-refund": db.taxInvoices.filter((t) => !t.piId).length,
      orders: 0,
    } as Record<string, number>;
  }, [db, viewer]);

  const pinnedItems = useMemo(
    () => NAV.flatMap((g) => g.items).filter((i) => pinned.includes(i.slug)),
    [pinned],
  );

  const togglePin = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  };

  const renderItem = (item: (typeof NAV)[number]["items"][number], inPinned = false) => {
    const href = navHref(item);
    const badge = counts[item.slug];
    return (
      <li key={`${inPinned ? "p" : "g"}-${item.slug}`}>
        <NavLink to={href} className="rail-item" data-label={item.title} onClick={onNavigate} end={href === "/dashboard"}>
          {/* 每个模块都有图标 —— 收成图标轨之后，一列没有区别的圆点等于没导航 */}
          {item.icon ? <Icon name={item.icon} size={15} className="rail-ico" /> : <span className="rail-dot" />}
          <span className="label truncate">{item.title}</span>
          {!item.built ? <span className="tag plan">规划中</span> : null}
          {badge ? (
            <span className="badge" data-tone={item.slug === "follow-ups" ? "coral" : "amber"}>
              {badge}
            </span>
          ) : item.built ? (
            <button
              className="pin"
              data-on={pinned.includes(item.slug) ? "1" : "0"}
              onClick={(e) => togglePin(item.slug, e)}
              aria-label={pinned.includes(item.slug) ? `取消置顶 ${item.title}` : `置顶 ${item.title}`}
              title={pinned.includes(item.slug) ? "取消置顶" : "置顶到常用"}
            >
              <Icon name="pin" />
            </button>
          ) : null}
        </NavLink>
      </li>
    );
  };

  return (
    <aside className="rail" aria-label="模块导航">
      <div className="rail-brand">
        <span className="rail-mark">
          <Icon name="ship" />
        </span>
        <span className="rail-name">
          <b>MT 通商</b>
          <span>MT TRADEFLOW</span>
        </span>
      </div>

      <div className="rail-search">
        <button onClick={onOpenPalette} title="搜索单据与模块 · ⌘K">
          <Icon name="search" />
          <span>搜索 / 跳转</span>
          <kbd style={{ marginLeft: "auto" }}>⌘K</kbd>
        </button>
      </div>

      <nav className="rail-nav">
        {pinnedItems.length && !collapsed ? (
          <div className="rail-group" data-open="1">
            <div className="rail-group-h">
              <Icon name="star" />
              <span>常用</span>
            </div>
            <ul className="rail-items">{pinnedItems.map((i) => renderItem(i, true))}</ul>
          </div>
        ) : null}

        {NAV.map((g) => {
          const open = !closedGroups.includes(g.title);
          const hasCurrent = g.items.some((i) => navHref(i) === pathname);
          return (
            <div className="rail-group" key={g.title} data-open={open || hasCurrent ? "1" : "0"}>
              <button
                className="rail-group-h"
                onClick={() => setClosedGroups((c) => (c.includes(g.title) ? c.filter((x) => x !== g.title) : [...c, g.title]))}
                aria-expanded={open}
              >
                <Icon name={g.icon} />
                <span>{g.title}</span>
                <Icon name="chevronDown" className="chev" />
              </button>
              <ul className="rail-items">{g.items.map((i) => renderItem(i))}</ul>
            </div>
          );
        })}
      </nav>

      <div className="rail-foot">
        <button className="rail-user" onClick={(e) => onOpenUserMenu(e.currentTarget)} aria-label="账号菜单">
          <Avatar name={displayName} hue={user?.hue ?? 0} src={picture} />
          <span className="who">
            <b>{displayName}</b>
            <small>
              {user ? ROLE_LABEL[user.role] : "未登录"} · {user ? SCOPE_LABEL[user.scope] : "—"}
            </small>
          </span>
          <Icon name="more" size={15} style={{ marginLeft: "auto", opacity: 0.6 }} />
        </button>
      </div>

      <button className="rail-toggle" onClick={onToggle} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} title={`${collapsed ? "展开" : "收起"}侧栏 · [`}>
        <Icon name="chevronsLeft" />
      </button>
      <div className="rail-grip" onPointerDown={onPointerDown} data-dragging={dragging ? "1" : "0"} title="拖动调整侧栏宽度" />
    </aside>
  );
}

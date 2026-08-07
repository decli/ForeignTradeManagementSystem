import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Brand";
import { Avatar } from "@/components/ui/bits";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listShipments } from "@/data/queries";
import { useDragResize, useStored } from "@/lib/hooks";
import { NAV, navHref, navTitle } from "@/lib/nav";
import { useT } from "@/i18n";

/**
 * 侧栏。
 *
 * 展开态可以拖宽度（200–360，记住），可以整组折叠，可以把常用模块钉到顶上；
 * 收起态变成 64px 图标轨，hover 出气泡认路。窄屏由外层切成浮层。
 */
/** 「常用」的折叠状态跟别的分组存在一起，用一个不会跟分组名撞车的键 */
const PIN_KEY = "__pins__";

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
  const { pathname } = useLocation();
  const { user, viewer, displayName, picture } = useAuth();
  const { t, lang } = useT();
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

  /* 当前页属于哪个模块、哪个分组。
     不能只靠 NavLink 的 aria-current —— 分组一折叠，那个链接根本没渲染，
     用户就完全看不出自己在哪儿了。所以路径要在这里自己解一次。 */
  const currentSlug = useMemo(() => {
    const seg = pathname.replace(/^\//, "").split("/")[0] || "dashboard";
    const key = seg === "m" ? pathname.split("/")[2] : seg;
    const all = NAV.flatMap((g) => g.items);
    return all.find((i) => i.href === `/${key}`)?.slug ?? all.find((i) => i.slug === key)?.slug ?? "";
  }, [pathname]);
  const currentGroup = useMemo(
    () => NAV.find((g) => g.items.some((i) => i.slug === currentSlug))?.title ?? "",
    [currentSlug],
  );

  const pinsOpen = !closedGroups.includes(PIN_KEY);

  const togglePin = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  };

  const renderItem = (item: (typeof NAV)[number]["items"][number], inPinned = false) => {
    const href = navHref(item);
    const badge = counts[item.slug];
    const isPinned = pinned.includes(item.slug);
    return (
      <li key={`${inPinned ? "p" : "g"}-${item.slug}`}>
        <NavLink
          to={href}
          className="rail-item"
          /* 置顶区是快捷方式，不是「位置」。同一页在这儿和它本来的分组里各出现一次，
             两处都画成实心选中，用户会以为这是两个不同的地方。 */
          data-shortcut={inPinned ? "1" : undefined}
          data-tip={collapsed ? navTitle(item, lang) : undefined}
          onClick={onNavigate}
          end={href === "/dashboard"}
        >
          {/* 每个模块都有图标 —— 收成图标轨之后，一列没有区别的圆点等于没导航 */}
          {item.icon ? <Icon name={item.icon} size={15} className="rail-ico" /> : <span className="rail-dot" />}
          <span className="label truncate">{navTitle(item, lang)}</span>
          {!item.built ? <span className="tag plan">{t("规划中")}</span> : null}
          {/* 角标和置顶按钮共用最右边这一格，靠 CSS 交叉淡入淡出：
              原来写成「有角标就不给置顶按钮」，结果跟单表（角标 10）永远取消不掉置顶。
              不并排是因为 rail 最窄 200px，并排会把标题挤没；
              而且「扫视时看角标、伸手时才要按钮」本来就是两个时刻。 */}
          {item.built ? (
            <span className="rail-slot">
              {badge ? (
                <span className="badge" data-tone={item.slug === "follow-ups" ? "coral" : "amber"}>
                  {badge}
                </span>
              ) : null}
              <button
                className="pin"
                data-on={isPinned ? "1" : "0"}
                onClick={(e) => togglePin(item.slug, e)}
                aria-label={`${t(isPinned ? "取消置顶" : "置顶到常用")} ${navTitle(item, lang)}`}
                data-tip={t(isPinned ? "取消置顶" : "置顶到常用")}
              >
                <Icon name="pin" />
              </button>
            </span>
          ) : null}
        </NavLink>
      </li>
    );
  };

  return (
    <aside className="rail" aria-label={t("模块")}>
      <div className="rail-brand">
        <Wordmark />
      </div>

      <div className="rail-search">
        <button onClick={onOpenPalette} data-tip={t("搜索 / 跳转") + " · ⌘K"}>
          <Icon name="search" />
          <span>{t("搜索 / 跳转")}</span>
          <kbd style={{ marginLeft: "auto" }}>⌘K</kbd>
        </button>
      </div>

      <nav className="rail-nav">
        {/* 置顶多了会把下面的分组挤出屏幕，所以它跟别的分组一样能收起来。
            一条也没置顶时整块不渲染 —— 留一个空的「常用」标题没有任何意义。 */}
        {pinnedItems.length > 0 && !collapsed ? (
          <div className="rail-group" data-pins="1" data-open={pinsOpen ? "1" : "0"}>
            <button
              className="rail-group-h"
              onClick={() => setClosedGroups((c) => (c.includes(PIN_KEY) ? c.filter((x) => x !== PIN_KEY) : [...c, PIN_KEY]))}
              aria-expanded={pinsOpen}
              aria-label={`${t("常用")} · ${t(pinsOpen ? "已展开，点击收起" : "已收起，点击展开")}`}
            >
              <Icon name="chevronDown" className="chev" />
              <Icon name="star" className="rail-group-ico" />
              <span className="truncate">{t("常用")}</span>
              <span className="rail-group-n">{pinnedItems.length}</span>
            </button>
            <ul className="rail-items">{pinnedItems.map((i) => renderItem(i, true))}</ul>
          </div>
        ) : null}

        {NAV.map((g) => {
          const open = !closedGroups.includes(g.title);
          const holdsCurrent = g.title === currentGroup;
          return (
            <div
              className="rail-group"
              key={g.title}
              data-open={open ? "1" : "0"}
              /* 折叠着但当前页在里面 —— 分组头亮起来并显示一个点，
                 「你在这儿，只是收起来了」。少了这个标记，一折叠就彻底失去方位感。 */
              data-holds-current={holdsCurrent ? "1" : undefined}
            >
              <button
                className="rail-group-h"
                onClick={() => setClosedGroups((c) => (c.includes(g.title) ? c.filter((x) => x !== g.title) : [...c, g.title]))}
                aria-expanded={open}
                aria-label={`${t(g.title)} · ${t(open ? "已展开，点击收起" : "已收起，点击展开")}`}
              >
                <Icon name="chevronDown" className="chev" />
                <Icon name={g.icon} className="rail-group-ico" />
                <span className="truncate">{t(g.title)}</span>
                <span className="rail-group-n">{g.items.length}</span>
                {holdsCurrent && !open ? <span className="rail-here" /> : null}
              </button>
              <ul className="rail-items">{g.items.map((i) => renderItem(i))}</ul>
            </div>
          );
        })}
      </nav>

      <div className="rail-foot">
        <button className="rail-user" onClick={(e) => onOpenUserMenu(e.currentTarget)} aria-label={t("账号菜单")}>
          <Avatar name={displayName} hue={user?.hue ?? 0} src={picture} />
          <span className="who">
            <b>{displayName}</b>
            <small>
              {user ? t(ROLE_LABEL[user.role]) : "—"} · {user ? t(SCOPE_LABEL[user.scope]) : "—"}
            </small>
          </span>
          <Icon name="more" size={15} style={{ marginLeft: "auto", opacity: 0.6 }} />
        </button>
      </div>

      <button className="rail-toggle" onClick={onToggle} aria-label={t(collapsed ? "展开侧栏" : "收起侧栏")} data-tip={`${t(collapsed ? "展开侧栏" : "收起侧栏")} · [`}>
        <Icon name="chevronsLeft" />
      </button>
      <div className="rail-grip" onPointerDown={onPointerDown} data-dragging={dragging ? "1" : "0"} data-tip={t("拖动调整侧栏宽度")} />
    </aside>
  );
}

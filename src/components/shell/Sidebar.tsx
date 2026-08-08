import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * 把某个节点滚进侧栏的可视区 —— Word 导航窗格那套「正文跳到哪，目录跟到哪」。
 *
 * 不用 `scrollIntoView()` 有两个原因：
 *  1. 它会顺手滚动**所有**可滚动祖先，窄屏浮层态下会把整页也带着动；
 *  2. `block: "nearest"` 会把目标顶到边上贴着，`block: "center"` 又在本来
 *     就看得见的时候也硬滚一下。这里要的是「看不见才滚，滚完不贴边」。
 */
function revealInto(box: HTMLElement, el: HTMLElement, smooth: boolean) {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  /* 上面留得比下面多：上面那点空当正好是分组头，「你在这一组的第几项」一起看见 */
  const padT = 12;
  const padB = 12;
  let delta = 0;
  if (r.top < b.top + padT) delta = r.top - b.top - padT;
  else if (r.bottom > b.bottom - padB) delta = r.bottom - b.bottom + padB;
  if (!delta) return false;
  const max = box.scrollHeight - box.clientHeight;
  let top = Math.max(0, Math.min(max, box.scrollTop + delta));
  /* 差一点点就到顶了就直接到顶。停在 40px 的位置只会让上面那一组露出半行，
     看着像没滚干净 —— 而那点距离本来也没有隐藏任何东西。 */
  if (top < 56) top = 0;
  const from = box.scrollTop;
  if (Math.abs(top - from) < 1) return false;
  box.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  /* 平滑滚动是会**静默失败**的：标签页在后台时合成器停摆，动画一帧都不跑，
     scrollTop 原地不动，而调用方毫不知情 —— 结果就是"高亮标在那儿，
     但那一行还在折叠线以下"，比不做还糟。
     等一拍回头看：完全没动就直接跳过去。只在「一点没动」时兜底 ——
     用户中途自己滚了不算失败，那时候把他拽回来才是真的讨厌。 */
  if (smooth) {
    window.setTimeout(() => {
      if (box.scrollTop === from) box.scrollTop = top;
    }, 320);
  }
  return true;
}

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

  /* ── 侧栏跟随当前页 ──
     从首页那排待办点进「应收账龄」，页面是打开了，但侧栏还停在最上面，
     「收付退税」那一组连同高亮项都在折叠线以下 —— 人一眼看不出自己在哪儿，
     也没法从当前位置继续往旁边走。Word 的导航窗格不是这样：跳到哪一节，
     左边的目录就展开那一支并滚过去。这里照做，三件事：
       1. 当前页所在分组如果是收起的，展开它；
       2. 当前项不在可视区就滚过去；
       3. 落地后闪一下，告诉眼睛"停在这儿了"—— 滚动结束时视线还在页面中间，
          不给个落点的话得自己再找一遍。 */
  const navRef = useRef<HTMLElement>(null);
  /* 首帧也要定位：刷新一次就丢失方位感，跟点进来是同一个问题 */
  const wantReveal = useRef<string | null>(currentSlug);
  const [landed, setLanded] = useState("");

  useEffect(() => {
    wantReveal.current = currentSlug;
    /* 只在**路由变了**的时候展开。挂在 currentSlug 上而不是每次渲染都做，
       用户自己在当前页把这组收起来时才不会被顶回去。 */
    if (currentGroup) setClosedGroups((c) => (c.includes(currentGroup) ? c.filter((x) => x !== currentGroup) : c));
  }, [currentSlug, currentGroup, setClosedGroups]);

  /* 展开是一次 setState，DOM 要下一帧才有那个节点。所以不挂依赖数组：
     每次渲染后看一眼「要定位的那一项渲染出来了吗」，出来了就定位一次。 */
  useEffect(() => {
    const slug = wantReveal.current;
    const nav = navRef.current;
    if (!slug || !nav) return;
    /* 置顶区是快捷方式不是位置（见 data-shortcut），要定位到它本来那一组里的那一项 */
    const el = nav.querySelector<HTMLElement>(`[data-slug="${slug}"]:not([data-shortcut])`);
    /* 分组收起来是靠 CSS 的 `display: none`，节点**还在** DOM 里 ——
       querySelector 照样找得到，但它没有布局：getBoundingClientRect() 全是 0，
       按它算出来的滚动位置必然是错的，而且这一趟一跑就把待办标记清掉了，
       等真正展开的那一帧反而不会再定位。offsetParent 为 null 就是「没布局」，
       这时候什么都别做，把机会留给下一帧。 */
    if (!el || el.offsetParent === null) return;
    wantReveal.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* 分组整体装得下就带着分组头一起露出来，装不下才只管这一项 */
    const grp = el.closest<HTMLElement>(".rail-group");
    const target = grp && grp.offsetHeight <= nav.clientHeight ? grp : el;
    const moved = revealInto(nav, target, !reduce);
    /* 本来就在眼皮底下就别闪 —— 没发生位移的高亮属于噪声 */
    if (moved) setLanded(slug);
  });

  useEffect(() => {
    if (!landed) return;
    const id = window.setTimeout(() => setLanded(""), 1100);
    return () => window.clearTimeout(id);
  }, [landed]);

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
          data-slug={item.slug}
          data-landed={!inPinned && landed === item.slug ? "1" : undefined}
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

      <nav className="rail-nav" ref={navRef}>
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

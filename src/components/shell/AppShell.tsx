import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Toaster } from "@/components/ui/Toast";
import { TooltipLayer } from "@/components/ui/TooltipLayer";
import { Avatar } from "@/components/ui/bits";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useHotkey, useIsMobile, useStored } from "@/lib/hooks";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { SystemBanner } from "./SystemBanner";
import { Topbar } from "./Topbar";
import { useT } from "@/i18n";

export function AppShell() {
  const { t } = useT();
  const [collapsed, setCollapsed] = useStored("mt.rail.collapsed", false);
  const [railW, setRailW] = useStored("mt.rail.w", 244);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenu, setUserMenu] = useState<{ top: number; left: number } | null>(null);
  const mobile = useIsMobile();
  const { pathname } = useLocation();
  const canvasRef = useRef<HTMLDivElement>(null);

  useHotkey("k", (e) => { e.preventDefault(); setPaletteOpen(true); }, { meta: true });
  useHotkey("[", () => setCollapsed((c) => !c));
  useHotkey("/", (e) => { e.preventDefault(); setPaletteOpen(true); });

  // 换页时把内容滚回顶部；侧栏浮层也顺手收起来
  useLayoutEffect(() => {
    canvasRef.current?.scrollTo({ top: 0 });
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div
      className="app"
      data-collapsed={collapsed && !mobile ? "1" : "0"}
      data-mobile-open={mobileOpen ? "1" : "0"}
      style={{ ["--rail-w" as string]: `${railW}px` }}
    >
      <a className="skip-link" href="#main">
        {t("跳到主内容")}
      </a>

      <Sidebar
        collapsed={collapsed && !mobile}
        onToggle={() => setCollapsed((c) => !c)}
        onOpenPalette={() => setPaletteOpen(true)}
        onNavigate={() => setMobileOpen(false)}
        onOpenUserMenu={(el) => {
          const r = el.getBoundingClientRect();
          setUserMenu({ top: r.top - 8, left: r.left });
        }}
        width={railW}
        onWidth={setRailW}
      />
      {mobileOpen ? <div className="rail-scrim" onClick={() => setMobileOpen(false)} /> : null}

      <div className="main">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} onOpenNav={() => setMobileOpen(true)} />
        <div className="canvas" ref={canvasRef} id="main">
          <SystemBanner />
          <Outlet />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {userMenu ? <UserMenu pos={userMenu} onClose={() => setUserMenu(null)} /> : null}
      <TooltipLayer />
      <Toaster />
    </div>
  );
}

function UserMenu({ pos, onClose }: { pos: { top: number; left: number }; onClose: () => void }) {
  const { t } = useT();
  const db = useDb();
  const nav = useNavigate();
  const { user, session, displayName, picture, signOut, impersonate } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const top = Math.max(8, Math.min(pos.top - 240, window.innerHeight - 300));

  return (
    <div className="pop" ref={ref} style={{ top, left: pos.left, width: 264 }} role="menu">
      <div style={{ display: "flex", gap: 10, padding: "8px 8px 10px", alignItems: "center" }}>
        <Avatar name={displayName} hue={user?.hue ?? 0} src={picture} size="lg" />
        <div style={{ minWidth: 0 }}>
          <b style={{ display: "block" }} className="truncate">
            {displayName}
          </b>
          <small className="muted truncate" style={{ display: "block", fontSize: "var(--fs-xs)" }}>
            {session?.email ?? (user ? `${t(ROLE_LABEL[user.role])} · ${t(SCOPE_LABEL[user.scope])}` : "")}
          </small>
        </div>
      </div>
      <div className="pop-sep" />

      {switching ? (
        <>
          <div className="pop-title">{t("以谁的身份查看（验证数据范围）")}</div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {db.users
              .filter((u) => u.active)
              .map((u) => (
                <button
                  key={u.id}
                  className="pop-item"
                  data-active={u.id === user?.id ? "1" : "0"}
                  onClick={() => {
                    impersonate(u.id);
                    onClose();
                  }}
                >
                  <Avatar name={u.name} hue={u.hue} size="sm" />
                  <span>{u.name}</span>
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {t(ROLE_LABEL[u.role])} · {t(SCOPE_LABEL[u.scope])}
                  </span>
                </button>
              ))}
          </div>
          <div className="pop-sep" />
          <button className="pop-item" onClick={() => setSwitching(false)}>
            <Icon name="chevronLeft" />
            {t("返回")}
          </button>
        </>
      ) : (
        <>
          <button className="pop-item" onClick={() => setSwitching(true)}>
            <Icon name="users" />
            {t("切换身份")}
            <span className="spacer" />
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("看数据范围")}</span>
          </button>
          <button
            className="pop-item"
            onClick={() => {
              nav("/settings");
              onClose();
            }}
          >
            <Icon name="sliders" />
            {t("系统设置")}
          </button>
          <button
            className="pop-item"
            onClick={() => {
              nav("/audit");
              onClose();
            }}
          >
            <Icon name="shield" />
            {t("审计日志")}
          </button>
          <div className="pop-sep" />
          <button
            className="pop-item pop-danger"
            onClick={() => {
              signOut();
              onClose();
            }}
          >
            <Icon name="logout" />
            {t("退出登录")}
          </button>
        </>
      )}
    </div>
  );
}

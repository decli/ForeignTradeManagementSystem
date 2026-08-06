"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_ICONS, navHref } from "@/lib/nav";

export function NavRail({
  collapsed,
  onToggle,
  user,
}: {
  collapsed: boolean;
  onToggle: () => void;
  user: { name: string; role: string; scope: string };
}) {
  const pathname = usePathname();

  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16.5 12 21l9-4.5" />
            <path d="M3 12 12 16.5 21 12" />
            <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
          </svg>
        </div>
        <div className="brand-txt">
          <b>MT 通商</b>
          <span>MT TRADEFLOW</span>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        {NAV.map((group) => (
          <div className="nav-group" key={group.title}>
            <div className="nav-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: NAV_ICONS[group.icon] }}
              />
              <span>{group.title}</span>
            </div>
            {group.items.map((item) => {
              const href = navHref(item);
              const current = pathname === href;
              return (
                <Link
                  key={item.slug}
                  href={href}
                  className="nav-item"
                  aria-current={current ? "page" : undefined}
                  title={item.title}
                >
                  <span className="nav-dot" aria-hidden="true" />
                  <span className="ni-t">{item.title}</span>
                  {item.built ? <span className="tag-built">已建</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        <div className="avatar">{user.name.slice(0, 1)}</div>
        <div className="who">
          <b>{user.name}</b>
          <span>
            {user.role} · {user.scope}
          </span>
        </div>
        <button
          className="icon-btn"
          onClick={onToggle}
          title={collapsed ? "展开导航" : "收起导航"}
          aria-label={collapsed ? "展开导航" : "收起导航"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={collapsed ? "m9 18 6-6-6-6" : "M15 18l-6-6 6-6"} />
          </svg>
        </button>
      </div>
    </aside>
  );
}

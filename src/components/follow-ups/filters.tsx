"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 截图里九个筛选器平铺占两行。这里只留最高频的三个 + 「仅进行中」，
 * 其余收进「更多筛选」。筛选走 URL，刷新和分享链接都能复现同一个视图。
 */
export function Filters({ salesNames }: { salesNames: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const [q, setQ] = useState(params.get("q") ?? "");
  const firstRender = useRef(true);

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // 搜索框防抖，免得每敲一个字就发一次查询
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = setTimeout(() => apply({ q: q || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onlyActive = params.get("active") !== "0";
  const hasFilters =
    Boolean(params.get("q") || params.get("state") || params.get("sales")) || !onlyActive;

  return (
    <div className="filters" data-ready={hydrated ? "1" : "0"}>
      <div className="field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜批次号 / 柜号 / 客户"
          style={{ width: 230 }}
          aria-label="搜索批次"
        />
      </div>

      <select
        aria-label="按放行状态筛选"
        value={params.get("state") ?? ""}
        onChange={(e) => apply({ state: e.target.value || null })}
      >
        <option value="">放行状态：全部</option>
        <option value="已放行">已放行</option>
        <option value="未放行">未放行</option>
        <option value="待报关">待报关</option>
      </select>

      <select
        aria-label="业务员"
        value={params.get("sales") ?? ""}
        onChange={(e) => apply({ sales: e.target.value || null })}
      >
        <option value="">业务员：全部</option>
        {salesNames.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={onlyActive}
          onChange={(e) => apply({ active: e.target.checked ? null : "0" })}
        />
        仅进行中
      </label>

      {pending ? (
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>筛选中…</span>
      ) : null}

      {hasFilters ? (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          重置
        </button>
      ) : null}
    </div>
  );
}

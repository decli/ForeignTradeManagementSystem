"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/use-hydrated";

export function OrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => apply({ q: q || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const archived = params.get("archived") === "1";
  const settle = params.get("settle") ?? "";
  const risk = params.get("risk") === "1";

  return (
    <div className="filters" data-ready={hydrated ? "1" : "0"}>
      <div className="segment" role="group" aria-label="归档状态">
        <button aria-pressed={!archived} onClick={() => apply({ archived: null })}>
          在跟进
        </button>
        <button aria-pressed={archived} onClick={() => apply({ archived: "1" })}>
          已归档
        </button>
      </div>

      <div className="segment" role="group" aria-label="结算状态">
        <button aria-pressed={settle === ""} onClick={() => apply({ settle: null })}>
          全部
        </button>
        <button aria-pressed={settle === "未完结"} onClick={() => apply({ settle: "未完结" })}>
          未完结
        </button>
        <button aria-pressed={settle === "已完结"} onClick={() => apply({ settle: "已完结" })}>
          已完结
        </button>
      </div>

      <label className="check" style={{ marginLeft: 6 }}>
        <input type="checkbox" checked={risk} onChange={(e) => apply({ risk: e.target.checked ? "1" : null })} />
        只看利润率预警
      </label>

      <div className="field" style={{ marginLeft: "auto" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜 PI 号 / 客户 / 业务员"
          style={{ width: 230 }}
          aria-label="搜索订单"
        />
      </div>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/use-hydrated";

export function TaxFilters({
  entities,
  buyers,
  months,
}: {
  entities: string[];
  buyers: string[];
  months: string[];
}) {
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

  const entity = params.get("entity") ?? "";

  return (
    <div className="filters" data-ready={hydrated ? "1" : "0"}>
      <div className="segment" role="group" aria-label="公司段">
        <button aria-pressed={entity === ""} onClick={() => apply({ entity: null })}>
          全部
        </button>
        {entities.map((e) => (
          <button key={e} aria-pressed={entity === e} onClick={() => apply({ entity: e })}>
            {e}
          </button>
        ))}
      </div>

      <select
        aria-label="申报月"
        value={params.get("month") ?? ""}
        onChange={(e) => apply({ month: e.target.value || null })}
      >
        <option value="">申报月：全部</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        aria-label="采购员"
        value={params.get("buyer") ?? ""}
        onChange={(e) => apply({ buyer: e.target.value || null })}
      >
        <option value="">采购员：全部</option>
        {buyers.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={params.get("unlinked") === "1"}
          onChange={(e) => apply({ unlinked: e.target.checked ? "1" : null })}
        />
        只看未关联订单
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
          placeholder="搜 PI 号 / 发票号 / 报关单号"
          style={{ width: 240 }}
          aria-label="搜索发票"
        />
      </div>
    </div>
  );
}

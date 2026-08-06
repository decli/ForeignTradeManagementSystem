"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CustomerRow } from "@/server/customers";
import { limitTone } from "@/lib/customer-rules";

export function CustomerList({ rows, selectedId }: { rows: CustomerRow[]; selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const push = (patch: Record<string, string | null>) => {
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
    // 搜索会换掉列表，选中项可能已不在结果里，一并清掉免得右侧对不上
    const id = setTimeout(() => push({ q: q || null, id: null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-h" style={{ padding: "10px 12px" }}>
        <div className="field" style={{ flex: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜客户 / 国家"
            style={{ width: "100%" }}
            aria-label="搜索客户"
          />
        </div>
      </div>
      <div className="clist">
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-3)", fontSize: 12.5 }}>
            没有匹配的客户
          </div>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              className="crow"
              aria-current={c.id === selectedId}
              onClick={() => push({ id: c.id })}
            >
              <span
                className="avatar"
                style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
              >
                {c.name.slice(0, 1)}
              </span>
              <span className="who">
                <b>{c.name}</b>
                <span>
                  {c.country} · {c.salesName}
                </span>
              </span>
              <span className={`pill plain num ${limitTone(c.usedPct)}`}>{c.usedPct}%</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

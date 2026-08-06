"use client";

import { useSearchParams } from "next/navigation";

/** 导出走当前筛选条件：把地址栏的查询串原样带给导出接口 */
export function ExportButton({ href, label = "导出 Excel" }: { href: string; label?: string }) {
  const params = useSearchParams();
  const qs = params.toString();

  return (
    <a className="btn" href={qs ? `${href}?${qs}` : href} download>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      {label}
    </a>
  );
}

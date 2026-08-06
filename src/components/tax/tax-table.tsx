"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCny, formatInt, formatMoney } from "@/lib/format";
import { toast } from "@/components/toast";
import type { TaxRow } from "@/server/tax";
import { linkInvoiceToPi } from "@/app/tax-refund/actions";

type Candidate = { id: string; piNo: string; product: string | null; customerName: string; signedOn: string };

export function TaxTable({
  rows,
  loadCandidates,
}: {
  rows: TaxRow[];
  loadCandidates: (invoiceId: string) => Promise<Candidate[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [linking, setLinking] = useState<{ row: TaxRow; candidates: Candidate[] } | null>(null);
  const [filter, setFilter] = useState("");

  const openLink = (row: TaxRow) => {
    startTransition(async () => {
      const candidates = await loadCandidates(row.id);
      setFilter("");
      setLinking({ row, candidates });
    });
  };

  const doLink = (piId: string) => {
    if (!linking) return;
    const row = linking.row;
    setLinking(null);
    startTransition(async () => {
      const res = await linkInvoiceToPi(row.id, piId);
      if (!res.ok) {
        toast(res.error ?? "关联失败");
        return;
      }
      router.refresh();
      toast(`发票 ${res.invoiceNo} 已关联`, () => {
        startTransition(async () => {
          await linkInvoiceToPi(row.id, res.previousPiId);
          router.refresh();
          toast("已撤销关联");
        });
      });
    });
  };

  const taxTotal = rows.reduce((s, r) => s + r.tax, 0);
  const shown = linking
    ? linking.candidates.filter(
        (c) =>
          !filter ||
          `${c.piNo}${c.customerName}${c.product ?? ""}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : [];

  return (
    <>
      <div className="table-wrap">
        <div className="table-bar">
          <span>
            本页 <b className="num">{formatInt(rows.length)}</b> 条 · 税额合计{" "}
            <b className="num">{formatCny(taxTotal, 2)}</b>
          </span>
          <span className="hint">未关联订单的行会标红 · 点「关联」挂到 PI 上</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>申报月</th>
                <th>批次</th>
                <th>采购员</th>
                <th style={{ minWidth: 130 }}>订单号</th>
                <th style={{ minWidth: 160 }}>销售方</th>
                <th>发票号</th>
                <th style={{ minWidth: 190 }}>明细</th>
                <th className="td-r">数量</th>
                <th className="td-r">含税</th>
                <th className="td-r">不含税</th>
                <th className="td-r">税额</th>
                <th>出口时间</th>
                <th>报关单号</th>
                <th className="td-r">报关 USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={14} className="empty">
                    没有匹配的发票行。换个筛选条件试试。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {r.declareMonth}
                    </td>
                    <td className="mono">{r.batch}</td>
                    <td className="nw">{r.buyer}</td>
                    <td className="nw">
                      {r.piNo ? (
                        <span className="cell-main" style={{ color: "var(--accent-ink)" }}>
                          {r.piNo}
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span className="pill coral">未关联</span>
                          <button className="btn btn-sm" onClick={() => openLink(r)}>
                            关联
                          </button>
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.sellerName}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {r.invoiceNo}
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.item}
                      </div>
                    </td>
                    <td className="td-r num">{formatInt(r.qty)}</td>
                    <td className="td-r num">{formatCny(r.gross, 2)}</td>
                    <td className="td-r num">{formatCny(r.net, 2)}</td>
                    <td className="td-r num" style={{ fontWeight: 600 }}>
                      {formatCny(r.tax, 2)}
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {r.exportedOn ?? "—"}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.customsNo ?? "—"}
                    </td>
                    <td
                      className="td-r num"
                      style={{ color: r.customsUsd ? "var(--accent-ink)" : "var(--text-3)" }}
                    >
                      {r.customsUsd ? formatMoney(r.customsUsd) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 关联向导 */}
      {linking ? (
        <>
          <div className="scrim is-on" onClick={() => setLinking(null)} />
          <aside className="drawer is-on" role="dialog" aria-modal="true" aria-label="关联订单">
            <div className="drawer-h">
              <div style={{ flex: 1 }}>
                <h2>关联订单</h2>
                <div className="sub">
                  发票 <span className="num">{linking.row.invoiceNo}</span> · {linking.row.sellerName}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setLinking(null)} aria-label="关闭">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-b">
              <div className="field" style={{ marginBottom: 12 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="搜 PI 号 / 客户 / 产品"
                  style={{ width: "100%" }}
                  aria-label="搜索候选订单"
                />
              </div>
              {shown.length === 0 ? (
                <p style={{ color: "var(--text-3)" }}>没有匹配的订单。</p>
              ) : (
                shown.map((c) => (
                  <button
                    key={c.id}
                    className="crow"
                    style={{ width: "100%" }}
                    onClick={() => doLink(c.id)}
                  >
                    <span className="who">
                      <b className="num">{c.piNo}</b>
                      <span>
                        {c.customerName} · {c.product ?? "—"} · 签约 {c.signedOn}
                      </span>
                    </span>
                    <span className="pill accent plain">关联</span>
                  </button>
                ))
              )}
            </div>
            <div className="drawer-f">
              <button className="btn" onClick={() => setLinking(null)}>
                取消
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

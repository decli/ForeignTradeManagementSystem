"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { formatMoney, formatCny, formatInt } from "@/lib/format";
import type { OrderRow, OrderDetail } from "@/server/orders";
import { PROFIT_WARN_PCT, rateTone } from "@/lib/order-rules";
import { OrderDrawer } from "./order-drawer";

export function OrderTable({
  rows,
  loadDetail,
}: {
  rows: OrderRow[];
  loadDetail: (id: string) => Promise<OrderDetail | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const open = (id: string) => {
    setLoading(true);
    startTransition(async () => {
      setDetail(await loadDetail(id));
      setLoading(false);
    });
  };

  const sort = params.get("sort") ?? "";
  const toggleSort = (key: string) => {
    const next = new URLSearchParams(params.toString());
    if (sort === key) next.delete("sort");
    else next.set("sort", key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <>
      <div className="table-wrap">
        <div className="table-bar">
          <span>
            本页 <b className="num">{rows.length}</b> 条 · 利润率预警{" "}
            <b className="num" style={{ color: "var(--coral)" }}>
              {rows.filter((r) => r.profitRate < PROFIT_WARN_PCT).length}
            </b>{" "}
            条
          </span>
          <span className="hint">点任意行看成本构成与收付款进度</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 128 }}>PI 号</th>
                <th>签约</th>
                <th>业务员</th>
                <th>客户</th>
                <th>目的国</th>
                <th style={{ minWidth: 160 }}>产品</th>
                <th className="td-r">订单额</th>
                <th className="td-r">采购成本</th>
                <th className="td-r">应收</th>
                <th className="td-r">应付</th>
                <th className="td-r">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggleSort("profit")}
                    title="按利润率排序"
                  >
                    利润率 {sort === "profit" ? "↑" : "⇅"}
                  </button>
                </th>
                <th>状态</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={13} className="empty">
                    没有匹配的订单。换个关键词，或取消「只看利润率预警」。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => open(r.id)}>
                    <td>
                      <div className="cell-main" style={{ color: "var(--accent-ink)" }}>
                        {r.piNo}
                      </div>
                      {r.flag ? (
                        <div style={{ marginTop: 3 }}>
                          <span className="badge-todo">{r.flag}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {r.signedOn}
                    </td>
                    <td className="nw">{r.salesName}</td>
                    <td className="nw">{r.customerName}</td>
                    <td className="nw">{r.destination}</td>
                    <td style={{ maxWidth: 190 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.product ?? "—"}
                      </div>
                    </td>
                    <td className="td-r num">{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</td>
                    <td className="td-r num" style={{ color: "var(--text-2)" }}>
                      {r.purchaseCost ? formatCny(r.purchaseCost) : "—"}
                    </td>
                    <td className="td-r num">{formatMoney(r.receivable, r.currency === "CNY" ? "¥" : "$")}</td>
                    <td className="td-r num" style={{ color: "var(--text-2)" }}>
                      {r.payable ? formatCny(r.payable) : "—"}
                    </td>
                    <td
                      className="td-r num"
                      style={{ fontWeight: 600, color: `var(--${rateTone(r.profitRate)})` }}
                    >
                      {r.profitRate.toFixed(2)}%
                    </td>
                    <td>
                      <span className={`pill ${r.settleState === "已完结" ? "mute" : "accent"}`}>
                        {r.settleState}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: "var(--accent)", fontSize: 12.5 }}>详情</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>
            共 <b className="num">{formatInt(rows.length)}</b> 条记录
          </span>
        </div>
      </div>

      <OrderDrawer detail={detail} loading={loading} onClose={() => { setDetail(null); setLoading(false); }} />
    </>
  );
}

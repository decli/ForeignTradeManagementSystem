"use client";

import { useEffect } from "react";
import { formatMoney, formatCny } from "@/lib/format";
import type { OrderDetail } from "@/server/orders";
import { rateTone } from "@/lib/order-rules";

export function OrderDrawer({
  detail,
  loading,
  onClose,
}: {
  detail: OrderDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const open = loading || Boolean(detail);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const symbol = detail?.currency === "CNY" ? "¥" : "$";
  const totalCost = detail?.costs.reduce((s, c) => s + c.value, 0) ?? 0;
  const collected = detail && detail.amount ? Math.round((detail.receivable / detail.amount) * 100) : 0;

  return (
    <>
      <div className={`scrim${open ? " is-on" : ""}`} onClick={onClose} />
      <aside
        className={`drawer${open ? " is-on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="订单核算详情"
      >
        {!detail ? (
          <div className="drawer-b">
            <p style={{ color: "var(--text-3)" }}>{loading ? "读取中…" : ""}</p>
          </div>
        ) : (
          <>
            <div className="drawer-h">
              <div style={{ flex: 1 }}>
                <h2 className="num">{detail.piNo}</h2>
                <div className="sub">
                  {detail.customerName} · {detail.destination} · 业务员 {detail.salesName} · 签约{" "}
                  {detail.signedOn}
                </div>
              </div>
              <span className={`pill ${rateTone(detail.profitRate)}`}>
                利润率 {detail.profitRate.toFixed(2)}%
              </span>
              <button className="icon-btn" onClick={onClose} aria-label="关闭">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-b">
              <div className="kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 18 }}>
                <div className="kpi" data-tone="accent">
                  <span className="k">订单额</span>
                  <span className="v num" style={{ fontSize: 20 }}>
                    {formatMoney(detail.amount, symbol)}
                  </span>
                </div>
                <div className="kpi" data-tone={detail.grossProfit < 0 ? "coral" : "jade"}>
                  <span className="k">预估毛利</span>
                  <span className="v num" style={{ fontSize: 20 }}>
                    {formatMoney(detail.grossProfit, symbol)}
                  </span>
                </div>
                <div className="kpi">
                  <span className="k">回款进度</span>
                  <span className="v num" style={{ fontSize: 20 }}>
                    {collected}%
                  </span>
                </div>
              </div>

              <h3 style={{ fontSize: 13.5, margin: "0 0 2px" }}>成本构成</h3>
              {totalCost > 0 ? (
                <>
                  <div className="costbar">
                    {detail.costs.map((c) => (
                      <i
                        key={c.label}
                        style={{ width: `${((c.value / totalCost) * 100).toFixed(1)}%`, background: c.color }}
                      />
                    ))}
                  </div>
                  <div className="legend">
                    {detail.costs.map((c) => (
                      <span key={c.label}>
                        <i style={{ background: c.color }} />
                        {c.label} <b className="num">{formatCny(c.value)}</b>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--text-3)", fontSize: 12.5 }}>
                  还没有录入成本。成本录入属于「采购合同」与「费用明细」模块，M3 打通。
                </p>
              )}

              <h3 style={{ fontSize: 13.5, margin: "22px 0 6px" }}>收付款进度</h3>
              <ul className="tl">
                <li data-s="done">
                  <div className="when">{detail.signedOn}</div>
                  <div>
                    收定金 30% · <span className="num">{formatMoney(detail.amount * 0.3, symbol)}</span>
                  </div>
                  <div className="who">已到账</div>
                </li>
                <li data-s={detail.receivable > 0 ? "done" : "late"}>
                  <div className="when">{detail.receivable > 0 ? "已收" : "待收"}</div>
                  <div>
                    收尾款 70% · <span className="num">{formatMoney(detail.amount * 0.7, symbol)}</span>
                  </div>
                  <div className="who">{detail.receivable > 0 ? "已到账" : "尚未收到"}</div>
                </li>
                <li data-s={detail.payable > 0 ? "done" : ""}>
                  <div className="when">{detail.payable > 0 ? "已付" : "待付"}</div>
                  <div>
                    付供应商货款 · <span className="num">{formatCny(detail.payable)}</span>
                  </div>
                  <div className="who">{detail.payable > 0 ? "已付" : "未安排"}</div>
                </li>
              </ul>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: -6 }}>
                收付款明细来自「收付款 / 财务」模块，M3 接入后这里会换成真实流水。
              </p>

              <h3 style={{ fontSize: 13.5, margin: "22px 0 6px" }}>关联单据</h3>
              <div className="scope" style={{ justifyContent: "flex-start" }}>
                <span>出运批次 {detail.shipments.length} 个</span>
                <span>退税发票 {detail.taxInvoiceCount} 张</span>
                <span>退税额 {formatCny(detail.taxTotal)}</span>
                {detail.sellerEntity ? <span>开票主体 {detail.sellerEntity}</span> : null}
              </div>

              {detail.shipments.length ? (
                <div style={{ marginTop: 12 }}>
                  {detail.shipments.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 0",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <span className="num" style={{ fontWeight: 600, fontSize: 12.5 }}>
                        {s.batchNo}
                      </span>
                      {s.batchLabel ? <span className="badge-batch">{s.batchLabel}</span> : null}
                      <span className="num" style={{ color: "var(--text-3)", fontSize: 12 }}>
                        {s.containerNo ?? "待订舱"}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        <span className="pill mute">{s.releaseState}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="drawer-f">
              <button className="btn" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

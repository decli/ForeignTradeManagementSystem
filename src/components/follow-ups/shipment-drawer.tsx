"use client";

import { useEffect, useRef, useState } from "react";
import { MilestoneRail } from "@/components/milestone-rail";
import type { ShipmentDetail } from "@/server/shipments";
import { RELEASE_TONE } from "./tone";

export function ShipmentDrawer({
  detail,
  loading,
  onClose,
}: {
  detail: ShipmentDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "notes" | "docs">("overview");
  const panelRef = useRef<HTMLElement>(null);
  const open = loading || Boolean(detail);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (detail) setTab("overview");
  }, [detail?.id]);

  const docs: [string, boolean][] = detail
    ? [
        ["商业发票", true],
        ["装箱单", true],
        ["提单 BL COPY", Boolean(detail.containerNo)],
        ["产地证 FORM", false],
        ["报关单", detail.releaseState !== "待报关"],
        ["熏蒸证明", false],
      ]
    : [];

  return (
    <>
      <div className={`scrim${open ? " is-on" : ""}`} onClick={onClose} />
      <aside
        ref={panelRef}
        className={`drawer${open ? " is-on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="出运批次详情"
      >
        {loading || !detail ? (
          <div className="drawer-b">
            <p style={{ color: "var(--text-3)" }}>{loading ? "读取中…" : ""}</p>
          </div>
        ) : (
          <>
            <div className="drawer-h">
              <div style={{ flex: 1 }}>
                <h2 className="num">
                  {detail.batchNo}{" "}
                  {detail.batchLabel ? <span className="badge-batch">{detail.batchLabel}</span> : null}
                </h2>
                <div className="sub">
                  {detail.country} · {detail.term} · {detail.mode}
                  {detail.fcl ? " · 整柜" : " · 拼柜"} · 业务员 {detail.salesName}
                </div>
              </div>
              <span className={`pill ${RELEASE_TONE[detail.releaseState] ?? "mute"}`}>
                {detail.releaseState}
              </span>
              <button className="icon-btn" onClick={onClose} aria-label="关闭">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-b">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
                  概览
                </button>
                <button role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
                  动态流水
                </button>
                <button role="tab" aria-selected={tab === "docs"} onClick={() => setTab("docs")}>
                  单证齐套
                </button>
              </div>

              {tab === "overview" ? (
                <>
                  <div style={{ margin: "2px 0 20px" }}>
                    <MilestoneRail milestones={detail.milestones} />
                  </div>
                  <dl className="dl">
                    <dt>关联 PI</dt>
                    <dd className="num">{detail.piNo ?? "—"}</dd>
                    <dt>客户</dt>
                    <dd>{detail.customerName ?? "—"}</dd>
                    <dt>产品</dt>
                    <dd>{detail.product ?? "—"}</dd>
                    <dt>柜号</dt>
                    <dd className="num">{detail.containerNo ?? "待订舱"}</dd>
                    <dt>船司 / 港口</dt>
                    <dd>
                      {detail.carrier ?? "—"} · {detail.pod ?? "—"}
                    </dd>
                    <dt>小组</dt>
                    <dd>{detail.team ?? "—"}</dd>
                    <dt>最新动态</dt>
                    <dd>{detail.latestNote ?? "—"}</dd>
                  </dl>
                </>
              ) : null}

              {tab === "notes" ? (
                detail.notes.length ? (
                  <ul className="tl">
                    {detail.notes.map((n) => (
                      <li key={n.id} data-s="done">
                        <div className="when">{n.on}</div>
                        <div>{n.body}</div>
                        <div className="who">{n.author}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: "var(--text-3)" }}>还没有动态记录。在列表页点一下动态就能写第一条。</p>
                )
              ) : null}

              {tab === "docs" ? (
                <div>
                  {docs.map(([name, ok]) => (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        gap: 11,
                        padding: "11px 0",
                        borderBottom: "1px solid var(--line)",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          flex: "0 0 26px",
                          borderRadius: 8,
                          display: "grid",
                          placeItems: "center",
                          background: ok ? "var(--jade-soft)" : "var(--amber-soft)",
                          color: ok ? "var(--jade)" : "var(--amber)",
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {ok ? <path d="m5 13 4 4L19 7" /> : <path d="M12 8v5M12 17h.01" />}
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: 13 }}>{name}</b>
                        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                          {ok ? "已上传" : "待补齐"}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 14 }}>
                    单证上传与齐套校验属于「单证备案」模块，将在 M4 打通。
                  </p>
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

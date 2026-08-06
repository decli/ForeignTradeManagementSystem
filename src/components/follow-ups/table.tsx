"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MilestoneRail } from "@/components/milestone-rail";
import { toast } from "@/components/toast";
import type { ShipmentRow, ShipmentDetail } from "@/server/shipments";
import {
  updateNote,
  bulkUpdate,
  revertBulk,
  archiveShipment,
  restoreShipment,
  toggleTodo,
} from "@/app/follow-ups/actions";
import { ShipmentDrawer } from "./shipment-drawer";
import { RELEASE_TONE, PHRASES } from "./tone";

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

export function FollowUpTable({
  rows,
  loadDetail,
}: {
  rows: ShipmentRow[];
  loadDetail: (id: string) => Promise<ShipmentDetail | null>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // 就地编辑动态的弹层
  const [editing, setEditing] = useState<{ row: ShipmentRow; top: number; left: number } | null>(null);
  const [draft, setDraft] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  // 详情抽屉
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 批量条
  const [bulkNote, setBulkNote] = useState("");
  const [bulkDate, setBulkDate] = useState(TODAY_ISO);
  const [bulkRel, setBulkRel] = useState("");

  // 选中的行被筛掉之后要同步清理，否则批量会打到看不见的行上
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setEditing(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  const toggleRow = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const openEditor = (row: ShipmentRow, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setDraft(row.latestNote ?? "");
    setEditing({
      row,
      top: window.scrollY + rect.bottom + 6,
      left: Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + document.documentElement.clientWidth - 336)),
    });
  };

  const saveNote = () => {
    if (!editing) return;
    const row = editing.row;
    const text = draft.trim();
    if (!text) {
      toast("动态不能为空");
      return;
    }
    setEditing(null);
    startTransition(async () => {
      const res = await updateNote(row.id, text);
      router.refresh();
      toast(res.ok ? `已更新 ${row.batchNo} 的动态` : res.error ?? "更新失败");
    });
  };

  const applyBulk = () => {
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkUpdate(ids, {
        body: bulkNote,
        happenedOn: bulkDate,
        releaseState: bulkRel,
      });
      if (!res.ok) {
        toast(res.error ?? "更新失败");
        return;
      }
      const snapshot = res.undo;
      router.refresh();
      setSelected(new Set());
      setBulkNote("");
      setBulkRel("");
      toast(`已更新 ${res.count} 行`, () => {
        startTransition(async () => {
          await revertBulk(snapshot);
          router.refresh();
          toast("已撤销");
        });
      });
    });
  };

  const remove = (row: ShipmentRow) => {
    startTransition(async () => {
      const res = await archiveShipment(row.id);
      if (!res.ok) {
        toast(res.error ?? "删除失败");
        return;
      }
      router.refresh();
      toast(`已删除 ${res.batchNo}`, () => {
        startTransition(async () => {
          await restoreShipment(row.id);
          router.refresh();
          toast("已恢复");
        });
      });
    });
  };

  const openDetail = (id: string) => {
    setDetailLoading(true);
    startTransition(async () => {
      const d = await loadDetail(id);
      setDetail(d);
      setDetailLoading(false);
    });
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <div className="table-wrap" aria-busy={pending}>
        <div className="table-bar">
          <span>
            本页 <b className="num">{rows.length}</b> 条
          </span>
          <span className="pill jade plain">
            进行中 {rows.filter((r) => !r.stalledDays && !r.hasLate).length}
          </span>
          <span className={`pill plain ${rows.some((r) => r.stalledDays || r.hasLate) ? "coral" : "mute"}`}>
            停滞 / 超期 {rows.filter((r) => r.stalledDays || r.hasLate).length}
          </span>
          <span className="hint">点动态即可直改 · 勾选多行可批量</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="全选"
                    checked={allChecked}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                    style={{ accentColor: "var(--accent)" }}
                  />
                </th>
                <th style={{ minWidth: 156 }}>批次号 / 国家</th>
                <th>业务员 / 小组</th>
                <th>走货</th>
                <th style={{ minWidth: 250 }}>最新动态</th>
                <th style={{ minWidth: 130 }}>柜号 / 船司</th>
                <th style={{ minWidth: 266 }}>进度里程碑</th>
                <th style={{ width: 96 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={8} className="empty">
                    当前筛选下没有批次。试试关掉「仅进行中」，或点右上角「重置」。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} data-sel={selected.has(r.id) ? "1" : "0"}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择 ${r.batchNo}`}
                        checked={selected.has(r.id)}
                        onChange={(e) => toggleRow(r.id, e.target.checked)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="cell-main">{r.batchNo}</span>
                        {r.batchLabel ? <span className="badge-batch">{r.batchLabel}</span> : null}
                      </div>
                      <div className="cell-sub">
                        <span>
                          {r.country} · {r.term}
                          {r.fcl ? "" : " · 拼柜"}
                        </span>
                        {r.piNo ? (
                          <span className="num" title={`关联 PI ${r.piNo}`}>
                            · {r.piNo}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div>{r.salesName}</div>
                      <div className="cell-sub">{r.team ?? "—"}</div>
                    </td>
                    <td>
                      <div>{r.mode}</div>
                      <div style={{ marginTop: 3 }}>
                        <span className={`pill ${RELEASE_TONE[r.releaseState] ?? "mute"}`}>
                          {r.releaseState}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button className="note-btn" onClick={(e) => openEditor(r, e.currentTarget)}>
                        <span className={`txt${r.latestNote ? "" : " note-empty"}`}>
                          {r.latestNote ?? "点这里写第一条动态"}
                        </span>
                        <span className="caret">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </span>
                      </button>
                      {r.stalledDays ? (
                        <div style={{ marginTop: 5 }}>
                          <span className="pill coral">停滞 {r.stalledDays} 天</span>
                        </div>
                      ) : null}
                      {r.hasTodo ? (
                        <div style={{ marginTop: 5 }}>
                          <span className="badge-todo">有待办</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {r.containerNo ? (
                        <>
                          <div className="num" style={{ fontSize: 12.5 }}>
                            {r.containerNo}
                          </div>
                          <div className="cell-sub">
                            {r.carrier ?? "—"} · {r.pod ?? "—"}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ color: "var(--text-3)" }}>—</div>
                          <div className="cell-sub">{r.pod ?? "待订舱"}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <MilestoneRail milestones={r.milestones} />
                    </td>
                    <td>
                      <div className="row-acts">
                        <button
                          className="icon-btn"
                          title="查看详情"
                          aria-label={`查看 ${r.batchNo} 详情`}
                          onClick={() => openDetail(r.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          className="icon-btn"
                          title={r.hasTodo ? "取消待办" : "加待办"}
                          aria-label={`${r.hasTodo ? "取消" : "添加"} ${r.batchNo} 的待办`}
                          onClick={() =>
                            startTransition(async () => {
                              await toggleTodo(r.id, !r.hasTodo);
                              router.refresh();
                              toast(r.hasTodo ? `已取消 ${r.batchNo} 的待办` : `已为 ${r.batchNo} 加待办`);
                            })
                          }
                          style={r.hasTodo ? { color: "var(--amber)" } : undefined}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 15V4h13l-1.5 3L17 10H4" />
                            <path d="M4 21V10" />
                          </svg>
                        </button>
                        <button
                          className="icon-btn"
                          title="删除批次"
                          aria-label={`删除 ${r.batchNo}`}
                          onClick={() => remove(r)}
                          style={{ color: "var(--coral)" }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 6h16" />
                            <path d="M9 6V4h6v2" />
                            <path d="M6 6l1 14h10l1-14" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 就地改动态：跟单员一天要做几十次，不该为此进详情页 */}
      {editing ? (
        <div className="pop" ref={popRef} style={{ top: editing.top, left: editing.left }} role="dialog" aria-label="修改最新动态">
          <h4>更新最新动态 · {editing.row.batchNo}</h4>
          <textarea
            rows={3}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
            }}
          />
          <div className="phrase-wrap" style={{ marginTop: 6 }}>
            {PHRASES.map((p) => (
              <button
                type="button"
                className="phrase"
                key={p}
                onClick={() => setDraft((d) => (d ? `${d}；${p}` : p))}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="pop-f">
            <button className="btn btn-sm" onClick={() => setEditing(null)}>
              取消
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveNote}>
              保存
            </button>
          </div>
        </div>
      ) : null}

      {/* 批量条：勾选后从底部升起，表格保留满宽 */}
      <div className={`bulkbar${selected.size ? " is-on" : ""}`} aria-hidden={selected.size === 0}>
        <div className="bulkbar-in">
          <div className="bb-top">
            <span className="bb-n">
              <b className="num">{selected.size}</b> 行已选
            </span>
            <div className="sel-list">
              {rows
                .filter((r) => selected.has(r.id))
                .slice(0, 4)
                .map((r) => (
                  <span className="sel-chip" key={r.id}>
                    {r.batchNo}
                  </span>
                ))}
              {selected.size > 4 ? <span className="sel-chip">+{selected.size - 4}</span> : null}
            </div>
            <div className="phrase-wrap">
              {PHRASES.map((p) => (
                <button
                  type="button"
                  className="phrase"
                  key={p}
                  onClick={() => setBulkNote((d) => (d ? `${d}；${p}` : p))}
                >
                  {p}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              取消选择
            </button>
          </div>
          <div className="bb-main">
            <input
              className="grow"
              type="text"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="写一条动态，一次应用到所选批次…"
              aria-label="批量动态"
            />
            <input
              type="date"
              className="num"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              aria-label="动态日期"
              style={{ width: 150 }}
            />
            <select
              value={bulkRel}
              onChange={(e) => setBulkRel(e.target.value)}
              aria-label="批量设置放行状态"
            >
              <option value="">放行状态不变</option>
              <option value="已放行">已放行</option>
              <option value="未放行">未放行</option>
              <option value="待报关">待报关</option>
            </select>
            <button className="btn btn-primary" onClick={applyBulk} disabled={pending}>
              {pending ? "应用中…" : "应用到所选"}
            </button>
          </div>
        </div>
      </div>

      <ShipmentDrawer
        detail={detail}
        loading={detailLoading}
        onClose={() => {
          setDetail(null);
          setDetailLoading(false);
        }}
      />
    </>
  );
}

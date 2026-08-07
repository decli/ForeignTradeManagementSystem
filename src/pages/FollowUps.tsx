import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { MilestoneRail } from "@/components/MilestoneRail";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { toast, toastError } from "@/components/ui/Toast";
import { Chip, EmptyState, Field, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { listSalesNames, listShipments, type ShipmentRow } from "@/data/queries";
import { archiveShipment, bulkUpdate, createShipment, restoreShipment, revertBulk, toggleTodo, updateNote } from "@/data/mutations";
import { deleteView, saveView } from "@/data/mutations";
import { humanDate, todayIso } from "@/lib/format";
import { useHotkey } from "@/lib/hooks";
import { MODES, PHRASES, RELEASE_STATES, RELEASE_TONE } from "@/lib/rules";
import { exportXlsx, stampName } from "@/lib/xlsx";
import { ShipmentDrawer } from "./follow-ups/ShipmentDrawer";

const MODULE = "follow-ups";

export default function FollowUps() {
  const { t } = useT();
  const db = useDb();
  const { user, viewer, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const readOnly = !can("write");

  // 筛选条件全部写进 URL：刷新不丢，也能把「当前这一屏」直接发给同事
  const q = params.get("q") ?? "";
  const release = params.get("release") ?? "";
  const sales = params.get("sales") ?? "";
  const mode = params.get("mode") ?? "";
  const onlyActive = params.get("active") !== "0";
  const onlyRisk = params.get("risk") === "1";
  const onlyTodo = params.get("todo") === "1";
  const openId = params.get("id");

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const rows = useMemo(
    () => listShipments(db, viewer, { q, releaseState: release, sales, mode, onlyActive, onlyRisk, onlyTodo }),
    [db, viewer, q, release, sales, mode, onlyActive, onlyRisk, onlyTodo],
  );
  const salesNames = useMemo(() => listSalesNames(db), [db]);
  const views = useMemo(() => db.savedViews.filter((v) => v.module === MODULE), [db.savedViews]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ShipmentRow | null>(null);
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");

  // 行被筛掉之后要同步清理勾选，否则批量会打到看不见的行上
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  useHotkey("n", () => !readOnly && setNewOpen(true));
  useHotkey("f", () => document.querySelector<HTMLInputElement>('.toolbar input[type="search"]')?.focus());

  const openIndex = openId ? rows.findIndex((r) => r.id === openId) : -1;

  const activeChips = [
    release && { k: t("放行状态"), v: release, clear: () => set({ release: null }) },
    sales && { k: t("业务员"), v: sales, clear: () => set({ sales: null }) },
    mode && { k: t("走货方式"), v: mode, clear: () => set({ mode: null }) },
    onlyRisk && { k: t("只看"), v: t("停滞 / 超期"), clear: () => set({ risk: null }) },
    onlyTodo && { k: t("只看"), v: t("有待办"), clear: () => set({ todo: null }) },
    q && { k: t("搜索"), v: q, clear: () => set({ q: null }) },
  ].filter(Boolean) as { k: string; v: string; clear: () => void }[];

  const columns: Column<ShipmentRow>[] = useMemo(
    () => [
      {
        key: "batch",
        title: t("批次号 / 国家"),
        width: 210,
        minWidth: 150,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.batchNo.localeCompare(b.batchNo),
        render: (r) => (
          <>
            {/* 批次号与「第 N 批」同处一行：号可截断，标签不折行 */}
            <div className="batch-cell">
              <span className="cell-main" title={r.batchNo}>
                {r.batchNo}
              </span>
              {r.batchLabel ? <span className="badge-batch">{r.batchLabel}</span> : null}
            </div>
            <div className="cell-sub">
              <span>
                {r.country} · {r.term}
                {r.fcl ? "" : t(" · 拼柜")}
              </span>
              {r.piNo ? (
                <span className="num" title={t("关联 PI {no}", { no: r.piNo })}>
                  · {r.piNo}
                </span>
              ) : null}
            </div>
          </>
        ),
      },
      {
        key: "customer",
        title: t("客户"),
        width: 150,
        sort: (a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? ""),
        render: (r) => (
          <>
            <div className="truncate">{r.customerName ?? "—"}</div>
            <div className="cell-sub">
              <span>{r.product ?? "—"}</span>
            </div>
          </>
        ),
      },
      {
        key: "sales",
        title: t("业务员 / 小组"),
        width: 116,
        sort: (a, b) => a.salesName.localeCompare(b.salesName),
        render: (r) => (
          <>
            <div className="truncate">{r.salesName}</div>
            <div className="cell-sub">
              <span>{r.team ?? "—"}</span>
            </div>
          </>
        ),
      },
      {
        key: "mode",
        title: t("走货"),
        width: 96,
        sort: (a, b) => a.releaseState.localeCompare(b.releaseState),
        render: (r) => (
          <>
            <div>{r.mode}</div>
            <div style={{ marginTop: 3 }}>
              <Pill tone={RELEASE_TONE[r.releaseState] ?? "mute"}>{r.releaseState}</Pill>
            </div>
          </>
        ),
      },
      {
        key: "note",
        title: t("最新动态"),
        width: 300,
        minWidth: 180,
        sort: (a, b) => (a.latestNoteOn ?? "").localeCompare(b.latestNoteOn ?? ""),
        tip: t("点一下就能改，不必进详情页"),
        render: (r) => (
          <>
            <button className="note-btn" onClick={() => setEditing(r)} disabled={readOnly} title={r.latestNote ?? undefined}>
              <span className={`txt${r.latestNote ? "" : " note-empty"}`}>{r.latestNote ?? t("点这里写第一条动态")}</span>
              <span className="caret">
                <Icon name="edit" size={13} />
              </span>
            </button>
            {r.stalledDays || r.hasTodo ? (
              <div className="row" style={{ gap: 5, marginTop: 5 }}>
                {r.stalledDays ? <Pill tone="coral">停滞 {r.stalledDays} 天</Pill> : null}
                {r.hasTodo ? <Pill tone="amber">{t("有待办")}</Pill> : null}
                {r.latestNoteOn ? <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{humanDate(r.latestNoteOn)}</span> : null}
              </div>
            ) : null}
          </>
        ),
      },
      {
        key: "container",
        title: t("柜号 / 船司"),
        width: 148,
        sort: (a, b) => (a.containerNo ?? "").localeCompare(b.containerNo ?? ""),
        render: (r) =>
          r.containerNo ? (
            <>
              <div className="num truncate" style={{ fontSize: "var(--fs-sm)" }} title={r.containerNo}>
                {r.containerNo}
              </div>
              <div className="cell-sub">
                <span>
                  {r.carrier ?? "—"} · {r.pod ?? "—"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="muted">—</div>
              <div className="cell-sub">
                <span>{r.pod ?? t("待订舱")}</span>
              </div>
            </>
          ),
      },
      {
        key: "milestones",
        title: t("进度里程碑"),
        width: 300,
        minWidth: 210,
        sort: (a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"),
        tip: t("按下一个待办节点的日期排序"),
        render: (r) => <MilestoneRail milestones={r.milestones} />,
      },
      {
        key: "acts",
        title: t("操作"),
        width: 104,
        hideable: false,
        align: "right",
        render: (r) => (
          <div className="row-acts">
            <button className="icon-btn" title={t("查看详情")} aria-label={t("查看 {no} 详情", { no: r.batchNo })} onClick={() => set({ id: r.id })}>
              <Icon name="eye" />
            </button>
            <button
              className="icon-btn"
              data-on={r.hasTodo ? "1" : "0"}
              title={r.hasTodo ? t("销掉待办") : t("标为待办")}
              aria-label={t("{act} {no} 的待办", { act: r.hasTodo ? t("销掉") : t("标记"), no: r.batchNo })}
              disabled={readOnly}
              onClick={() => {
                toggleTodo(actor, r.id, !r.hasTodo);
                toast(r.hasTodo ? t("已销掉 {no} 的待办", { no: r.batchNo }) : t("已给 {no} 加待办", { no: r.batchNo }));
              }}
            >
              <Icon name="flag" />
            </button>
            <button
              className="icon-btn"
              title={t("删除批次")}
              aria-label={t("删除 {no}", { no: r.batchNo })}
              disabled={readOnly}
              style={{ color: "var(--coral)" }}
              onClick={() => {
                const res = archiveShipment(actor, r.id);
                toast(t("已删除 {no}", { no: res.batchNo }), () => {
                  restoreShipment(r.id);
                  toast("已恢复");
                });
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ),
      },
    ],
    // actor 每次渲染都是新对象，放进依赖会让整列定义每帧重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, set],
  );

  const doExport = async () => {
    await exportXlsx<ShipmentRow>(
      stampName("跟单表"),
      [
        { header: t("批次号"), width: 20, value: (r) => r.batchNo },
        { header: t("分批"), width: 8, value: (r) => r.batchLabel },
        { header: t("国家"), width: 12, value: (r) => r.country },
        { header: t("客户"), width: 20, value: (r) => r.customerName },
        { header: t("关联 PI"), width: 16, value: (r) => r.piNo },
        { header: t("条款"), width: 10, value: (r) => r.term },
        { header: t("走货"), width: 8, value: (r) => r.mode },
        { header: t("整柜/拼柜"), width: 10, value: (r) => (r.fcl ? t("整柜") : t("拼柜")) },
        { header: t("柜号"), width: 18, value: (r) => r.containerNo },
        { header: t("船司"), width: 10, value: (r) => r.carrier },
        { header: t("目的港"), width: 14, value: (r) => r.pod },
        { header: t("放行状态"), width: 10, value: (r) => r.releaseState },
        { header: t("业务员"), width: 10, value: (r) => r.salesName },
        { header: t("小组"), width: 10, value: (r) => r.team },
        { header: t("最新动态"), width: 42, value: (r) => r.latestNote },
        { header: t("动态日期"), width: 12, type: "date", value: (r) => r.latestNoteOn },
        { header: t("停滞天数"), width: 10, type: "number", format: "0", value: (r) => r.stalledDays || null },
        ...(["交期", "装柜", "进仓", "ATD", "ETA"] as const).map((kind) => ({
          header: kind,
          width: 12,
          type: "date" as const,
          value: (r: ShipmentRow) => {
            const m = r.milestones.find((x) => x.kind === kind);
            return m?.actual ?? m?.planned ?? null;
          },
        })),
      ],
      rows,
    );
    toast(t("已导出 {n} 行（跟随当前筛选）", { n: rows.length }));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("跟单表")}</h1>
          <p>{t("出运跟踪台账 · 一行一个出运批次 · 点动态即可直改，勾选多行可批量")}</p>
        </div>
        <div className="page-acts">
          <button className="btn" onClick={doExport}>
            <Icon name="download" />
            {t("导出 Excel")}
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)} disabled={readOnly} title={t("新增批次 · N")}>
            <Icon name="plus" />
            {t("新增批次")}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜批次号 / 柜号 / 客户 / 目的港…")} />

        <Segmented
          value={onlyRisk ? "risk" : onlyTodo ? "todo" : "all"}
          onChange={(v) => set({ risk: v === "risk" ? "1" : null, todo: v === "todo" ? "1" : null })}
          options={[
            { value: "all", label: t("全部"), count: undefined },
            { value: "risk", label: t("有风险"), count: rows.length && onlyRisk ? undefined : undefined },
            { value: "todo", label: t("有待办") },
          ]}
          label={t("快速视图")}
        />

        <span className="toolbar-sep" />

        <select className="select" value={release} onChange={(e) => set({ release: e.target.value })} aria-label={t("放行状态")}>
          <option value="">{t("放行：全部")}</option>
          {RELEASE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select className="select" value={sales} onChange={(e) => set({ sales: e.target.value })} aria-label={t("业务员")}>
          <option value="">{t("业务员：全部")}</option>
          {salesNames.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select className="select" value={mode} onChange={(e) => set({ mode: e.target.value })} aria-label={t("走货方式")}>
          <option value="">{t("走货：全部")}</option>
          {MODES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="switch">
          <input type="checkbox" checked={onlyActive} onChange={(e) => set({ active: e.target.checked ? null : "0" })} />
          {t("仅进行中")}
        </label>

        <SavedViews
          views={views}
          onApply={(query) => setParams(new URLSearchParams(query), { replace: true })}
          onSave={() => {
            const name = prompt("给这个视图起个名字", "我的视图");
            if (!name) return;
            saveView(MODULE, name, params.toString());
            toast(t("已保存视图「{name}」", { name }));
          }}
          onDelete={(id, name) => {
            deleteView(id);
            toast(t("已删除视图「{name}」", { name }));
          }}
        />

        {activeChips.length ? (
          <>
            <span className="toolbar-sep" />
            <div className="chips" style={{ flex: "1 1 100%" }}>
              {activeChips.map((c) => (
                <Chip key={`${c.k}${c.v}`} label={c.k} value={c.v} onClear={c.clear} />
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                {t("全部清除")}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <DataGrid<ShipmentRow>
        gridId="follow-ups"
        rows={rows}
        columns={columns}
        selected={readOnly ? undefined : selected}
        onSelectedChange={readOnly ? undefined : setSelected}
        rowTone={(r) => (r.stalledDays || r.hasLate ? "coral" : r.hasTodo ? "amber" : undefined)}
        onRowOpen={(r) => set({ id: r.id })}
        getRowLabel={(r) => r.batchNo}
        bar={
          <>
            <span>
              {t("本页")} <b className="num">{rows.length}</b> {t("条")}
            </span>
            <Pill tone="jade" dot={false}>
              进行中 {rows.filter((r) => !r.stalledDays && !r.hasLate).length}
            </Pill>
            <Pill tone={rows.some((r) => r.stalledDays || r.hasLate) ? "coral" : "mute"} dot={false}>
              停滞 / 超期 {rows.filter((r) => r.stalledDays || r.hasLate).length}
            </Pill>
          </>
        }
        empty={
          <EmptyState
            icon="ship"
            title={q || activeChips.length ? t("当前筛选下没有批次") : t("还没有出运批次")}
            desc={
              q || activeChips.length
                ? t("试试关掉「仅进行中」，或者清掉上面的筛选条件。")
                : t("点右上角「新增批次」建第一票，或者先去 PI 取号。")
            }
            action={
              activeChips.length ? (
                <button className="btn btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  {t("清除全部筛选")}
                </button>
              ) : null
            }
          />
        }
        renderCard={(r) => (
          <button className="rcard" data-tone={r.stalledDays || r.hasLate ? "coral" : r.hasTodo ? "amber" : undefined} key={r.id} onClick={() => set({ id: r.id })}>
            <div className="rcard-top">
              <span className="cell-main truncate">{r.batchNo}</span>
              {r.batchLabel ? <span className="badge-batch">{r.batchLabel}</span> : null}
              <span className="spacer" />
              <Pill tone={RELEASE_TONE[r.releaseState] ?? "mute"}>{r.releaseState}</Pill>
            </div>
            <div className="rcard-meta">
              <span>
                {r.country} · {r.term} · {r.mode}
              </span>
              <span>{r.customerName ?? "—"}</span>
              <span>{r.salesName}</span>
            </div>
            <div className="rcard-note clamp-2">{r.latestNote ?? t("还没有动态")}</div>
            {r.stalledDays || r.hasTodo ? (
              <div className="row" style={{ gap: 5 }}>
                {r.stalledDays ? <Pill tone="coral">停滞 {r.stalledDays} 天</Pill> : null}
                {r.hasTodo ? <Pill tone="amber">{t("有待办")}</Pill> : null}
              </div>
            ) : null}
            <div style={{ paddingTop: 4 }}>
              <MilestoneRail milestones={r.milestones} />
            </div>
          </button>
        )}
      />

      <BulkBar
        rows={rows}
        selected={selected}
        onClear={() => setSelected(new Set())}
        onApply={(patch) => {
          const ids = [...selected];
          const res = bulkUpdate(actor, ids, patch);
          if (!res.ok) {
            toastError(res.error);
            return false;
          }
          setSelected(new Set());
          toast(t("已更新 {n} 行", { n: res.count }), () => {
            revertBulk(res.undo);
            toast("已撤销");
          });
          return true;
        }}
      />

      <NoteEditor
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(text, date) => {
          if (!editing) return;
          const res = updateNote(actor, editing.id, text, date);
          if (!res.ok) toastError(res.error);
          else toast(t("已更新 {no} 的动态", { no: editing.batchNo }));
          setEditing(null);
        }}
      />

      <NewShipmentModal
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
          set({ new: null });
        }}
        onCreated={(id) => {
          setNewOpen(false);
          set({ new: null, id });
        }}
      />

      {openId ? (
        <ShipmentDrawer
          id={openId}
          onClose={() => set({ id: null })}
          onPrev={openIndex > 0 ? () => set({ id: rows[openIndex - 1].id }) : undefined}
          onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => set({ id: rows[openIndex + 1].id }) : undefined}
        />
      ) : null}
    </div>
  );
}

/* ───────────────── 保存的视图 ───────────────── */

function SavedViews({
  views,
  onApply,
  onSave,
  onDelete,
}: {
  views: { id: string; name: string; query: string }[];
  onApply: (q: string) => void;
  onSave: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { t } = useT();
  return (
    <Menu
      align="end"
      width={230}
      trigger={(p) => (
        <button className="btn btn-sm" {...p} ref={p.ref}>
          <Icon name="star" />
          视图
          {views.length ? <span className="muted">{views.length}</span> : null}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pop-title">{t("保存的筛选组合")}</div>
          {views.length === 0 ? (
            <div style={{ padding: "6px 10px 10px", fontSize: "var(--fs-sm)", color: "var(--text-3)" }}>
              {t("还没有保存的视图。筛好之后点下面「保存当前筛选」。")}
            </div>
          ) : (
            views.map((v) => (
              <div key={v.id} className="pop-item" style={{ paddingRight: 4 }}>
                <button
                  style={{ flex: 1, border: 0, background: "transparent", textAlign: "left", color: "inherit", minWidth: 0 }}
                  onClick={() => {
                    onApply(v.query);
                    close();
                  }}
                >
                  <span className="truncate" style={{ display: "block" }}>
                    {v.name}
                  </span>
                </button>
                <button className="icon-btn" aria-label={t("删除视图 {name}", { name: v.name })} onClick={() => onDelete(v.id, v.name)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))
          )}
          <div className="pop-sep" />
          <button
            className="pop-item"
            onClick={() => {
              onSave();
              close();
            }}
          >
            <Icon name="plus" />
            {t("保存当前筛选")}
          </button>
        </>
      )}
    </Menu>
  );
}

/* ───────────────── 就地改动态 ───────────────── */

function NoteEditor({
  row,
  onClose,
  onSave,
}: {
  row: ShipmentRow | null;
  onClose: () => void;
  onSave: (text: string, date: string) => void;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayIso);

  useEffect(() => {
    if (row) {
      setText(row.latestNote ?? "");
      setDate(row.latestNoteOn ?? todayIso());
    }
  }, [row]);

  if (!row) return null;

  return (
    <Modal
      open
      title={t("更新最新动态 · {no}", { no: row.batchNo })}
      onClose={onClose}
      width={520}
      footer={
        <>
          <span className="muted" style={{ fontSize: "var(--fs-sm)", marginRight: "auto" }}>
            <kbd>⌘</kbd> + <kbd>↵</kbd> {t("保存")}
          </span>
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(text, date)} disabled={!text.trim()}>
            {t("保存")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10, paddingBottom: 4 }}>
        <textarea
          className="input"
          rows={3}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text, date);
          }}
          placeholder={t("这票现在是什么状态？")}
        />
        <div className="phrase-wrap">
          {PHRASES.map((p) => (
            <button key={p} className="phrase" onClick={() => setText((d) => (d ? `${d}；${p}` : p))}>
              {p}
            </button>
          ))}
        </div>
        <Field label={t("动态日期")}>
          <input type="date" className="input num" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        </Field>
      </div>
    </Modal>
  );
}

/* ───────────────── 批量条 ───────────────── */

function BulkBar({
  rows,
  selected,
  onClear,
  onApply,
}: {
  rows: ShipmentRow[];
  selected: Set<string>;
  onClear: () => void;
  onApply: (patch: { body?: string; happenedOn?: string; releaseState?: string }) => boolean;
}) {
  const { t } = useT();
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso);
  const [rel, setRel] = useState("");
  const picked = rows.filter((r) => selected.has(r.id));

  return (
    <div className="bulkbar" data-on={selected.size ? "1" : "0"} aria-hidden={selected.size === 0}>
      <div className="bb-top">
        <span className="bb-n">
          <b className="num">{selected.size}</b> {t("行已选")}
        </span>
        <div className="sel-list">
          {picked.slice(0, 5).map((r) => (
            <span className="sel-chip" key={r.id}>
              {r.batchNo}
            </span>
          ))}
          {selected.size > 5 ? <span className="sel-chip">+{selected.size - 5}</span> : null}
        </div>
        <span className="spacer" />
        <div className="phrase-wrap">
          {PHRASES.slice(0, 4).map((p) => (
            <button key={p} className="phrase" onClick={() => setNote((d) => (d ? `${d}；${p}` : p))}>
              {p}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClear}>
          {t("取消选择")}
        </button>
      </div>
      <div className="bb-main">
        <input
          className="input grow"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("写一条动态，一次应用到所选批次…")}
          aria-label={t("批量动态")}
        />
        <input type="date" className="input num" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("动态日期")} style={{ width: 150 }} />
        <select className="select" value={rel} onChange={(e) => setRel(e.target.value)} aria-label={t("批量设置放行状态")}>
          <option value="">{t("放行状态不变")}</option>
          {RELEASE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (onApply({ body: note, happenedOn: date, releaseState: rel })) {
              setNote("");
              setRel("");
            }
          }}
        >
          {t("应用到所选")}
        </button>
      </div>
    </div>
  );
}

/* ───────────────── 新增批次 ───────────────── */

function NewShipmentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const db = useDb();
  const { user } = useAuth();
  const [piId, setPiId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [label, setLabel] = useState("");
  const [term, setTerm] = useState("FOB-SH");
  const [mode, setMode] = useState<(typeof MODES)[number]>("海运");
  const [fcl, setFcl] = useState(true);
  const [pod, setPod] = useState("");
  const [delivery, setDelivery] = useState("");
  const [note, setNote] = useState("");

  const openPis = useMemo(() => db.pis.filter((p) => p.status === "open").slice(0, 200), [db.pis]);
  const pi = openPis.find((p) => p.id === piId);
  const customer = pi ? db.customers.find((c) => c.id === pi.customerId) : undefined;

  // 选了 PI 就按「PI 号 - 第几批」自动补一个批次号，省得手打
  useEffect(() => {
    if (!pi) return;
    const n = db.shipments.filter((s) => s.piId === pi.id).length + 1;
    setBatchNo(`${pi.piNo}-${n}`);
    setLabel(n > 1 ? `第${n}批` : "");
  }, [pi, db.shipments]);

  if (!open) return null;

  const submit = () => {
    const res = createShipment(
      { id: user?.id ?? null, name: user?.name ?? "—" },
      {
        batchNo,
        batchLabel: label,
        piId: piId || null,
        country: customer?.country ?? "—",
        term,
        mode,
        fcl,
        pod,
        salesId: pi?.salesId ?? user?.id ?? null,
        team: user?.team ?? null,
        deliveryOn: delivery || undefined,
        note,
      },
    );
    if (!res.ok) {
      toastError(res.error);
      return;
    }
    toast(t("已建 {no}", { no: batchNo }));
    onCreated(res.id);
  };

  return (
    <Modal
      open
      title={t("新增出运批次")}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!batchNo.trim()}>
            {t("建这一票")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, paddingBottom: 6 }}>
        <Field label={t("关联 PI")} hint={t("选了之后批次号、国家、业务员会自动带出来")}>
          <select className="select" value={piId} onChange={(e) => setPiId(e.target.value)}>
            <option value="">{t("暂不关联")}</option>
            {openPis.map((p) => {
              const c = db.customers.find((x) => x.id === p.customerId);
              return (
                <option key={p.id} value={p.id}>
                  {p.piNo} · {c?.name} · {p.product ?? ""}
                </option>
              );
            })}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10 }}>
          <Field label={t("批次号")}>
            <input className="input num" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="MT26X05144-1" />
          </Field>
          <Field label={t("分批标签")}>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("第1批")} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label={t("贸易条款")}>
            <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} />
          </Field>
          <Field label={t("走货方式")}>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("装箱方式")} hint={fcl ? t("整柜：4 个节点") : t("拼柜：多一个进仓")}>
            <select className="select" value={fcl ? "1" : "0"} onChange={(e) => setFcl(e.target.value === "1")}>
              <option value="1">{t("整柜 FCL")}</option>
              <option value="0">{t("拼柜 LCL")}</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("目的港")}>
            <input className="input" value={pod} onChange={(e) => setPod(e.target.value)} placeholder={t("洛杉矶")} />
          </Field>
          <Field label={t("计划交期")}>
            <input type="date" className="input num" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          </Field>
        </div>

        <Field label={t("第一条动态")} hint={t("可以留空，之后在表里点动态补")}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("已下单工厂，等排产")} />
        </Field>
      </div>
    </Modal>
  );
}

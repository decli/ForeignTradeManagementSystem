import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { useDragResize, useIsNarrow, useStored } from "@/lib/hooks";
import { useT } from "@/i18n";

export type Column<T> = {
  key: string;
  title: string;
  /** 默认列宽（px）。用户拖过之后以拖出来的为准 */
  width: number;
  minWidth?: number;
  /** 冻结在左侧。冻结列必须连续地放在最前面 */
  freeze?: boolean;
  align?: "left" | "right";
  /** 给了就能点表头排序 */
  sort?: (a: T, b: T) => number;
  render: (row: T, index: number) => ReactNode;
  /** 能不能在「列设置」里被隐藏，默认可以 */
  hideable?: boolean;
  /** 表头上的一句解释 */
  tip?: string;
};

export type GridPrefs = { widths: Record<string, number>; hidden: string[]; sortKey: string; sortDir: "asc" | "desc" | "" };

const DEFAULT_PREFS: GridPrefs = { widths: {}, hidden: [], sortKey: "", sortDir: "" };

export function DataGrid<T extends { id: string }>({
  gridId,
  rows,
  columns,
  selected,
  onSelectedChange,
  rowTone,
  onRowOpen,
  renderCard,
  empty,
  bar,
  pageSize: initialPageSize = 50,
  maxHeight,
  getRowLabel,
}: {
  /** 列宽 / 隐藏列 / 排序按这个键分别记住 */
  gridId: string;
  rows: T[];
  columns: Column<T>[];
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  rowTone?: (row: T) => "coral" | "amber" | "accent" | undefined;
  onRowOpen?: (row: T) => void;
  /** 窄屏用的卡片渲染。不给就在窄屏下横向滚表格 */
  renderCard?: (row: T) => ReactNode;
  empty: ReactNode;
  bar?: ReactNode;
  pageSize?: number;
  maxHeight?: string;
  getRowLabel?: (row: T) => string;
}) {
  const { t } = useT();
  const [prefs, setPrefs] = useStored<GridPrefs>(`mt.grid.${gridId}`, DEFAULT_PREFS);
  const [pageSize, setPageSize] = useStored(`mt.grid.${gridId}.size`, initialPageSize);
  const [page, setPage] = useState(1);
  const [focusIdx, setFocusIdx] = useState(-1);
  const narrow = useIsNarrow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPicked = useRef<number>(-1);

  const visible = useMemo(() => columns.filter((c) => !prefs.hidden.includes(c.key)), [columns, prefs.hidden]);
  const widthOf = useCallback((c: Column<T>) => prefs.widths[c.key] ?? c.width, [prefs.widths]);

  // 冻结列的 left 偏移 = 它前面所有冻结列的宽度之和
  const freezeLefts = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = 0;
    for (const c of visible) {
      if (!c.freeze) break;
      map[c.key] = acc;
      acc += widthOf(c);
    }
    return map;
  }, [visible, widthOf]);
  const lastFreezeKey = useMemo(() => {
    const frozen = visible.filter((c) => c.freeze);
    return frozen.length ? frozen[frozen.length - 1].key : null;
  }, [visible]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === prefs.sortKey);
    if (!col?.sort || !prefs.sortDir) return rows;
    const dir = prefs.sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => col.sort!(a, b) * dir);
  }, [rows, columns, prefs.sortKey, prefs.sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => sorted.slice((safePage - 1) * pageSize, safePage * pageSize), [sorted, safePage, pageSize]);

  // 筛选把行数改小之后，停在第 7 页会看到空白 —— 回到第 1 页
  useEffect(() => setPage(1), [rows.length, pageSize]);

  // 滚动阴影：只有真的滚出去了才亮，否则平白多两道边
  const [shadow, setShadow] = useState({ x: false, y: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const on = () => setShadow({ x: el.scrollLeft > 1, y: el.scrollTop > 1 });
    on();
    el.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", on);
      ro.disconnect();
    };
  }, [pageRows.length, narrow]);

  const toggleSort = (key: string) =>
    setPrefs((p) => {
      if (p.sortKey !== key) return { ...p, sortKey: key, sortDir: "asc" };
      if (p.sortDir === "asc") return { ...p, sortDir: "desc" };
      if (p.sortDir === "desc") return { ...p, sortKey: "", sortDir: "" };
      return { ...p, sortDir: "asc" };
    });

  const setWidth = (key: string, w: number) => setPrefs((p) => ({ ...p, widths: { ...p.widths, [key]: Math.round(w) } }));

  const pick = (row: T, index: number, e: React.MouseEvent | React.KeyboardEvent) => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    // Shift 连选：一次勾一整段，比点十下快
    if ("shiftKey" in e && e.shiftKey && lastPicked.current >= 0) {
      const [lo, hi] = [lastPicked.current, index].sort((a, b) => a - b);
      const on = !selected.has(row.id);
      for (let i = lo; i <= hi; i++) {
        const r = pageRows[i];
        if (!r) continue;
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
    } else {
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
    }
    lastPicked.current = index;
    onSelectedChange(next);
  };

  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected?.has(r.id));
  const someChecked = !allChecked && pageRows.some((r) => selected?.has(r.id));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, Math.min(pageRows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && focusIdx >= 0 && pageRows[focusIdx]) {
      e.preventDefault();
      onRowOpen?.(pageRows[focusIdx]);
    } else if (e.key === " " && focusIdx >= 0 && pageRows[focusIdx]) {
      e.preventDefault();
      pick(pageRows[focusIdx], focusIdx, e);
    }
  };

  const footer = (
    <div className="grid-foot">
      <span>
        {t("共")} <b className="num">{sorted.length}</b> {t("条")}
        {sorted.length > pageSize ? (
          <>
            {` · ${t("第")} `}
            <b className="num">{safePage}</b>/{totalPages} {t("页")}
          </>
        ) : null}
      </span>
      <select
        className="select"
        style={{ height: 26, fontSize: "var(--fs-sm)" }}
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value))}
        aria-label={t("每页行数")}
      >
        {[25, 50, 100, 200].map((n) => (
          <option key={n} value={n}>
            {t("每页 {n} 行", { n })}
          </option>
        ))}
      </select>
      {totalPages > 1 ? (
        <div className="pager">
          <button onClick={() => setPage(1)} disabled={safePage === 1} aria-label={t("第一页")}>
            <Icon name="chevronsLeft" />
          </button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} aria-label={t("上一页")}>
            <Icon name="chevronLeft" />
          </button>
          {pageNumbers(safePage, totalPages).map((n, i) =>
            n === 0 ? (
              <span key={`gap${i}`} style={{ padding: "0 2px" }}>
                …
              </span>
            ) : (
              <button key={n} aria-current={n === safePage} onClick={() => setPage(n)}>
                {n}
              </button>
            ),
          )}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} aria-label={t("下一页")}>
            <Icon name="chevronRight" />
          </button>
        </div>
      ) : null}
    </div>
  );

  const columnMenu = (
    <Menu
      align="end"
      width={230}
      trigger={(p) => (
        <button className="btn btn-sm" {...p} ref={p.ref}>
          <Icon name="columns" />
          {t("列")}
        </button>
      )}
    >
      {() => (
        <>
          <div className="pop-title">{t("显示的列")}</div>
          {columns.map((c) => {
            const on = !prefs.hidden.includes(c.key);
            const locked = c.hideable === false;
            return (
              <button
                key={c.key}
                className="pop-item"
                disabled={locked}
                style={locked ? { opacity: 0.5 } : undefined}
                onClick={() =>
                  setPrefs((p) => ({ ...p, hidden: on ? [...p.hidden, c.key] : p.hidden.filter((k) => k !== c.key) }))
                }
              >
                <input type="checkbox" className="check" checked={on} readOnly tabIndex={-1} />
                <span>{c.title}</span>
                {locked ? <span className="spacer" /> : null}
                {locked ? <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>固定</span> : null}
              </button>
            );
          })}
          <div className="pop-sep" />
          <button className="pop-item" onClick={() => setPrefs(DEFAULT_PREFS)}>
            <Icon name="refresh" />
            {t("恢复默认列宽与排序")}
          </button>
        </>
      )}
    </Menu>
  );

  // ── 窄屏：卡片流 ──
  if (narrow && renderCard) {
    return (
      <div>
        {bar || onSelectedChange ? (
          <div className="grid-bar" style={{ border: 0, padding: "0 0 10px" }}>
            {bar}
          </div>
        ) : null}
        {pageRows.length === 0 ? (
          <div className="grid-wrap">{empty}</div>
        ) : (
          <div className="cards">{pageRows.map((r) => renderCard(r))}</div>
        )}
        {sorted.length > pageSize ? <div className="grid-wrap" style={{ marginTop: 10 }}>{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="grid-wrap">
      <div className="grid-bar">
        {onSelectedChange && selected ? null : null}
        {bar}
        <span className="spacer" />
        {columnMenu}
      </div>

      <div
        className="grid-scroll"
        ref={scrollRef}
        data-x={shadow.x ? "1" : "0"}
        data-y={shadow.y ? "1" : "0"}
        style={maxHeight ? { ["--grid-max-h" as string]: maxHeight } : undefined}
        tabIndex={0}
        onKeyDown={onKey}
        role="region"
        aria-label="数据表格，方向键移动，回车打开详情"
      >
        <table className="grid" style={{ minWidth: visible.reduce((s, c) => s + widthOf(c), 0) }}>
          <colgroup>
            {onSelectedChange ? <col style={{ width: 38 }} /> : null}
            {visible.map((c) => (
              <col key={c.key} style={{ width: widthOf(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {onSelectedChange && selected ? (
                <th data-freeze style={{ ["--fl" as string]: "0px" }}>
                  <div className="grid-th">
                    <input
                      type="checkbox"
                      className="check"
                      aria-label={t("全选本页")}
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={(e) => {
                        const next = new Set(selected);
                        for (const r of pageRows) {
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                        }
                        onSelectedChange(next);
                      }}
                    />
                  </div>
                </th>
              ) : null}
              {visible.map((c) => (
                <th
                  key={c.key}
                  data-freeze={c.freeze ? "" : undefined}
                  data-freeze-last={c.key === lastFreezeKey ? "" : undefined}
                  style={c.freeze ? { ["--fl" as string]: `${(freezeLefts[c.key] ?? 0) + (onSelectedChange ? 38 : 0)}px` } : undefined}
                  aria-sort={prefs.sortKey === c.key ? (prefs.sortDir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <div className={`grid-th${c.align === "right" ? " right" : ""}`}>
                    {c.sort ? (
                      <button
                        className="grid-sort"
                        data-dir={prefs.sortKey === c.key ? prefs.sortDir : ""}
                        onClick={() => toggleSort(c.key)}
                        title={c.tip ?? `按${c.title}排序`}
                      >
                        <span className="truncate">{c.title}</span>
                        <Icon name="arrowUp" />
                      </button>
                    ) : (
                      <span className="truncate" title={c.tip}>
                        {c.title}
                      </span>
                    )}
                    <ColGrip width={widthOf(c)} min={c.minWidth ?? 80} onChange={(w) => setWidth(c.key, w)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={visible.length + (onSelectedChange ? 1 : 0)} style={{ padding: 0 }}>
                  {empty}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr
                  key={row.id}
                  data-sel={selected?.has(row.id) ? "1" : "0"}
                  data-focus={focusIdx === i ? "1" : "0"}
                  data-tone={rowTone?.(row)}
                  onMouseDown={() => setFocusIdx(i)}
                >
                  {onSelectedChange && selected ? (
                    <td data-freeze style={{ ["--fl" as string]: "0px" }}>
                      <input
                        type="checkbox"
                        className="check"
                        checked={selected.has(row.id)}
                        aria-label={`选择 ${getRowLabel?.(row) ?? row.id}`}
                        onChange={() => undefined}
                        onClick={(e) => pick(row, i, e)}
                      />
                    </td>
                  ) : null}
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      data-freeze={c.freeze ? "" : undefined}
                      data-freeze-last={c.key === lastFreezeKey ? "" : undefined}
                      style={{
                        ...(c.freeze ? { ["--fl" as string]: `${(freezeLefts[c.key] ?? 0) + (onSelectedChange ? 38 : 0)}px` } : {}),
                        ...(c.align === "right" ? { textAlign: "right" as const } : {}),
                      }}
                    >
                      {c.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageRows.length > 0 ? footer : null}
    </div>
  );
}

function ColGrip({ width, min, onChange }: { width: number; min: number; onChange: (w: number) => void }) {
  const { t } = useT();
  const get = useCallback(() => width, [width]);
  const { dragging, onPointerDown } = useDragResize(get, onChange, { min, max: 720 });
  return (
    <span
      className="col-grip"
      data-dragging={dragging ? "1" : "0"}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(min)}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("拖动调整列宽")}
      title={t("拖动调整列宽，双击还原到最窄")}
    />
  );
}

/** 1 … 4 5 6 … 20，0 表示省略号 */
function pageNumbers(cur: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set<number>([1, total, cur, cur - 1, cur + 1]);
  const nums = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const res: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) res.push(0);
    res.push(nums[i]);
  }
  return res;
}

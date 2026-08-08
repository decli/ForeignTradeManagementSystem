import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { StickyXScroll } from "@/components/grid/StickyXScroll";
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
  summary,
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
  /**
   * 表头上方那条工具栏里的摘要。
   *
   * 原来那一条只放一个「列」按钮，右边一大片空着 —— 一个数据密度极高的台账应用，
   * 最不该浪费的就是表格正上方这块视线必经之处。放几个当前筛选下的合计
   * （在跟 21 · 停滞 5 · 利润合计 …），用户不用滚到底也不用心算。
   */
  summary?: Array<{ k: string; v: string; tone?: "coral" | "amber" | "jade" }>;
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

  /**
   * 没给 summary 的表格，用行色调兜一个底。
   *
   * 表头正上方那条是视线必经之处，空着是浪费；但也不能凭空编数字 ——
   * `rowTone` 是页面已经声明过的"这一行有没有问题"，拿它汇总是它本来的含义，
   * 不是我们替页面猜的。页面给了 summary 就以页面的为准。
   */
  const autoSummary = useMemo(() => {
    if (summary?.length) return summary;
    if (!rowTone) return [];
    let bad = 0;
    let warn = 0;
    for (const r of rows) {
      const tone = rowTone(r);
      if (tone === "coral") bad++;
      else if (tone === "amber") warn++;
    }
    const out: NonNullable<typeof summary> = [{ k: t("当前"), v: String(rows.length) }];
    if (bad) out.push({ k: t("要紧"), v: String(bad), tone: "coral" });
    if (warn) out.push({ k: t("留意"), v: String(warn), tone: "amber" });
    return out;
  }, [summary, rows, rowTone, t]);

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

  /* 宽表横向滚过去之后很容易看串行 —— 悬停时把整列淡淡地点亮一下。
     纯 CSS 办不到：同一列的格子不是兄弟节点，而且 CSS 也没法拿一个属性值
     去匹配另一个属性（`[data-col=attr(data-hc)]` 不存在）。所以只能在换列时
     给那一列的格子打个 data-hot。事件委托 + 只在列真的变了才写 DOM，
     一页最多五十来个节点，比每格挂一个 onMouseEnter 便宜得多。 */
  /**
   * 滚轮轴锁定。
   *
   * 触控板两指滑动几乎不可能是纯水平的 —— 横向滑一下总带着几像素的纵向分量，
   * 于是表格横滚的同时整页也在上下晃。原生滚动没有"锁轴"这回事，只能自己来：
   * 一次手势按第一帧的主方向定死，横向就只横向、纵向就交还给页面。
   * 手势之间隔 140ms 没有事件就算结束，下一次重新判定。
   */
  /* ⚠️ 必须用原生监听 + passive:false。React 的 onWheel 在根节点上是被动注册的，
     里面调 preventDefault() 只会得到一句控制台警告，页面照样跟着晃。 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const axis = { dir: null as "x" | "y" | null, at: 0 };
    const on = (e: WheelEvent) => {
      const now = e.timeStamp;
      if (now - axis.at > 140) axis.dir = null;
      axis.at = now;
      if (!axis.dir) axis.dir = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "x" : "y";
      if (axis.dir !== "x") return;
      if (el.scrollWidth <= el.clientWidth) return;
      // 横向手势：只喂横轴，纵向分量丢掉，页面不跟着晃
      e.preventDefault();
      el.scrollLeft += e.deltaX || e.deltaY;
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [narrow]);

  const hotCol = useRef("");
  const trackCol = useCallback((e: React.MouseEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest?.("[data-col]") as HTMLElement | null;
    const key = cell?.dataset.col ?? "";
    if (key === hotCol.current) return;
    const table = e.currentTarget;
    table.querySelectorAll<HTMLElement>("[data-hot]").forEach((n) => n.removeAttribute("data-hot"));
    if (key) table.querySelectorAll<HTMLElement>(`[data-col="${CSS.escape(key)}"]`).forEach((n) => (n.dataset.hot = ""));
    hotCol.current = key;
  }, []);
  const clearCol = useCallback((e: React.MouseEvent<HTMLTableElement>) => {
    e.currentTarget.querySelectorAll<HTMLElement>("[data-hot]").forEach((n) => n.removeAttribute("data-hot"));
    hotCol.current = "";
  }, []);

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
                {locked ? <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("固定")}</span> : null}
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
    <>
    <div className="grid-wrap">
      <div className="grid-bar">
        {bar}
        {autoSummary.length ? (
          <ul className="grid-sum">
            {autoSummary.map((s2) => (
              <li key={s2.k} data-tone={s2.tone}>
                <span>{s2.k}</span>
                <b className="num">{s2.v}</b>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="spacer" />
        {columnMenu}
      </div>

      {/* 一行都没有时不渲染表格。
          空的表头 + 一条横向滚动条是纯噪音：既没有内容可看，又让人以为
          "是不是滚过去还有东西"。上面的摘要已经写了「当前 0」，
          筛选条件也在工具条里摆着，表头在这里不提供任何信息。 */}
      {pageRows.length === 0 ? (
        <div className="grid-none">{empty}</div>
      ) : (
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
        <table className="grid" onMouseOver={trackCol} onMouseLeave={clearCol} style={{ minWidth: visible.reduce((s, c) => s + widthOf(c), 0) }}>
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
                  data-col={c.key}
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
                        title={c.tip ?? t("按{col}排序", { col: c.title })}
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
            {pageRows.map((row, i) => (
                <tr
                  key={row.id}
                  data-sel={selected?.has(row.id) ? "1" : "0"}
                  data-focus={focusIdx === i ? "1" : "0"}
                  data-tone={rowTone?.(row)}
                  data-open={onRowOpen ? "1" : undefined}
                  onMouseDown={() => setFocusIdx(i)}
                  /* 整行可点开详情。
                     原来 onRowOpen 只绑了回车键，鼠标用户必须去找行尾那个小图标 ——
                     而列表里最自然的动作就是"点这一行看看"。
                     行内还嵌着就地编辑的控件（备注按钮、下拉、复选框），
                     所以要把来自交互元素的点击排除掉，否则改个状态会顺带弹出抽屉。 */
                  onClick={
                    onRowOpen
                      ? (e) => {
                          const el = e.target as HTMLElement;
                          if (el.closest("button, a, input, select, textarea, label, [role='button'], [contenteditable]")) return;
                          // 拖选文字不该被当成点击
                          if (window.getSelection()?.toString()) return;
                          onRowOpen(row);
                        }
                      : undefined
                  }
                >
                  {onSelectedChange && selected ? (
                    <td data-freeze style={{ ["--fl" as string]: "0px" }}>
                      <input
                        type="checkbox"
                        className="check"
                        checked={selected.has(row.id)}
                        aria-label={t("选择 {row}", { row: getRowLabel?.(row) ?? row.id })}
                        onChange={() => undefined}
                        onClick={(e) => pick(row, i, e)}
                      />
                    </td>
                  ) : null}
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      data-col={c.key}
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
              ))}
          </tbody>
        </table>
      </div>
      )}

      {pageRows.length > 0 ? footer : null}
    </div>
    {/* fixed 定位，得挂在 .grid-wrap 的 overflow: hidden 之外，不然会被裁掉 */}
    {pageRows.length > 0 ? <StickyXScroll targetRef={scrollRef} /> : null}
    </>
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

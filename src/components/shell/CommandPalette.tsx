import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { spotlightSearch } from "@/data/queries";
import { useScrollLock } from "@/lib/hooks";
import { ALL_ITEMS, navHref } from "@/lib/nav";
import { useThemeCycle } from "@/lib/theme";
import { useT } from "@/i18n";

type Entry = { id: string; group: string; label: string; sub: string; icon: IconName; run: () => void };

/**
 * ⌘K。三类东西放一起搜：**模块**（去哪）、**单据**（找什么）、**动作**（做什么）。
 * 只做子序列匹配，不引模糊搜索库 —— 中文没词根，模糊分数反而不如「按输入顺序出现」直觉。
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const db = useDb();
  const { viewer, signOut } = useAuth();
  const nav = useNavigate();
  const { cycle } = useThemeCycle();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const go = (href: string) => () => {
      nav(href);
      onClose();
    };
    const modules: Entry[] = ALL_ITEMS.map((i) => ({
      id: `m:${i.slug}`,
      group: "模块",
      label: i.title,
      sub: i.built ? "已接数据" : "规划中 · 看功能范围",
      icon: i.icon ?? "layout",
      run: go(navHref(i)),
    }));

    const actions: Entry[] = [
      { id: "a:new-ship", group: "动作", label: "新增出运批次", sub: "跟单表 · 建一行新批次", icon: "plus", run: go("/follow-ups?new=1") },
      { id: "a:new-pi", group: "动作", label: "PI 取号", sub: "按号段规则取下一个 PI 号", icon: "tag", run: go("/pi?new=1") },
      { id: "a:risk", group: "动作", label: "只看有风险的批次", sub: "停滞 / 里程碑超期", icon: "alert", run: go("/follow-ups?risk=1") },
      { id: "a:unlinked", group: "动作", label: "只看未关联的退税发票", sub: "影响本期申报", icon: "unlink", run: go("/tax-refund?unlinked=1") },
      { id: "a:loss", group: "动作", label: "只看利润率预警订单", sub: "低于 11% 或负毛利", icon: "gauge", run: go("/orders?risk=1") },
      { id: "a:theme", group: "动作", label: "切换外观", sub: "浅色 / 深色 / 跟随系统", icon: "sun", run: () => { cycle(); onClose(); } },
      { id: "a:settings", group: "动作", label: "系统设置", sub: "密度、账套数据、本地账号", icon: "sliders", run: go("/settings") },
      { id: "a:signout", group: "动作", label: "退出登录", sub: "回到登录页", icon: "logout", run: () => { signOut(); onClose(); } },
    ];

    const records: Entry[] = q.trim()
      ? spotlightSearch(db, viewer, q, 6).map((h, i) => ({
          id: `r:${i}:${h.href}`,
          group: h.kind,
          label: h.label,
          sub: h.sub,
          icon: h.kind === "客户" ? "users" : h.kind === "退税发票" ? "file" : h.kind === "出运批次" ? "ship" : "tag",
          run: go(h.href),
        }))
      : [];

    return [...records, ...modules, ...actions];
  }, [db, viewer, q, nav, onClose, cycle, signOut]);

  const results = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return entries.filter((e) => e.group === "模块" || e.group === "动作").slice(0, 14);
    const scored = entries
      .map((e) => ({ e, s: score(`${e.label} ${e.sub}`.toLowerCase(), key) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.slice(0, 18).map((x) => x.e);
  }, [entries, q]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="cmdk-in">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="搜批次号 / 柜号 / PI / 客户 / 发票号，或直接跳模块…"
            aria-label="搜索"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 ? (
            <div className="empty" style={{ padding: "32px 20px" }}>
              <p>{t("没搜到「{q}」。试试批次号的后四位，或者客户名。", { q })}</p>
            </div>
          ) : (
            results.map((r, i) => {
              const head = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.id}>
                  {head ? <div className="cmdk-group">{head}</div> : null}
                  <button className="cmdk-item" data-active={i === active ? "1" : "0"} onMouseEnter={() => setActive(i)} onClick={r.run}>
                    <span className="ico">
                      <Icon name={r.icon} />
                    </span>
                    <span className="body">
                      <b>{r.label}</b>
                      <small>{r.sub}</small>
                    </span>
                    {i === active ? <kbd>↵</kbd> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("选择")}
          </span>
          <span>
            <kbd>↵</kbd> {t("打开")}
          </span>
          <span>
            <kbd>Esc</kbd> {t("关闭")}
          </span>
          <span className="spacer" />
          <span>{t("共 {n} 项", { n: results.length })}</span>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** 子序列匹配：连续命中给更高分，命中在开头再加一点 */
function score(text: string, key: string) {
  if (text.includes(key)) return 100 + (text.startsWith(key) ? 20 : 0);
  let ti = 0;
  let hits = 0;
  let streak = 0;
  let best = 0;
  for (const ch of key) {
    const at = text.indexOf(ch, ti);
    if (at < 0) return 0;
    streak = at === ti ? streak + 1 : 1;
    best = Math.max(best, streak);
    ti = at + 1;
    hits++;
  }
  return hits === key.length ? 20 + best * 3 : 0;
}

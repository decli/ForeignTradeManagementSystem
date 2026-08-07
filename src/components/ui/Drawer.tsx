import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useDragResize, useIsNarrow, useScrollLock, useStored } from "@/lib/hooks";

/**
 * 详情抽屉。
 *
 * 三个不肯让步的地方：
 *  - 宽度可拖，且记住 —— 有人要边看列表边看详情，有人要详情占大半屏；
 *  - 上下条切换 —— 跟单员是一票一票往下看的，不该每次都回列表再点一次；
 *  - 窄屏走底部弹层，抽屉在手机上把内容挤成一条。
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  onPrev,
  onNext,
  tabs,
  tab,
  onTab,
  footer,
  children,
  storageKey = "mt.drawer.w",
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  tabs?: { key: string; label: string }[];
  tab?: string;
  onTab?: (k: string) => void;
  footer?: ReactNode;
  children: ReactNode;
  storageKey?: string;
}) {
  const [width, setWidth] = useStored(storageKey, 580);
  const narrow = useIsNarrow();
  useScrollLock(open);
  const bodyRef = useRef<HTMLDivElement>(null);
  const getW = useCallback(() => width, [width]);
  const { dragging, onPointerDown } = useDragResize(getW, setWidth, { min: 380, max: 1100, invert: true });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "j" && onNext) onNext();
      if (e.key === "k" && onPrev) onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onNext, onPrev]);

  // 换一票时把内容滚回顶部，否则会停在上一票的滚动位置
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [title]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "详情"}
        style={{ ["--drawer-w" as string]: narrow ? "100vw" : `${width}px` }}
      >
        {!narrow ? <div className="drawer-grip" onPointerDown={onPointerDown} data-dragging={dragging ? "1" : "0"} title="拖动改变宽度" /> : null}
        <div className="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{title}</h2>
            {subtitle ? <div className="cell-sub" style={{ marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          <div className="row" style={{ gap: 2 }}>
            {onPrev || onNext ? (
              <>
                <button className="icon-btn" onClick={onPrev} disabled={!onPrev} data-tip="上一条 · K" aria-label="上一条">
                  <Icon name="chevronLeft" />
                </button>
                <button className="icon-btn" onClick={onNext} disabled={!onNext} data-tip="下一条 · J" aria-label="下一条">
                  <Icon name="chevronRight" />
                </button>
                <span className="toolbar-sep" style={{ margin: "0 4px" }} />
              </>
            ) : null}
            <button className="icon-btn" onClick={onClose} aria-label="关闭" data-tip="关闭 · Esc">
              <Icon name="x" />
            </button>
          </div>
        </div>
        {tabs?.length ? (
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => onTab?.(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="drawer-body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}

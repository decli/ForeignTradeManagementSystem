import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "@/lib/hooks";

/** 悬停多久才展开。太短的话横扫过顶栏会一路弹出面板 */
const HOVER_IN = 130;
/** 离开多久才收。这段时间也顺便盖住了触发元素和面板之间那 6px 的空隙 */
const HOVER_OUT = 240;

/**
 * 同一时刻只允许一个悬停面板开着。
 *
 * 顶栏的汇率和世界时间挨着放。光靠各自的收起延时是不够的：只要在其中一个里
 * 点过东西（比如点开「添加币种」又反悔），它就钉住了，这时再去悬停旁边那个，
 * 两块面板会一起摊在屏幕上，还互相盖住。
 */
let openHoverPanel: (() => void) | null = null;

type TriggerProps = {
  onClick: () => void;
  "aria-expanded": boolean;
  ref: React.Ref<HTMLButtonElement>;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

/**
 * 下拉菜单。渲染到 body 上，免得被表格的 `overflow: auto` 裁掉；
 * 位置贴着触发元素，靠边时自动翻到另一侧。
 *
 * `hover` 打开「悬停即展开」。给顶栏那些**看一眼就走**的信息面板用
 * （汇率、世界时间）—— 为了瞄一眼报价而点一下、看完再点一下关掉，
 * 这两次点击是白付的。
 *
 * 但这类面板里又有增删按钮，纯悬停会变成「手一抖面板就没了」。
 * 所以一旦在里面点过任何东西就**钉住**：此后只有点外面或 Esc 才关。
 * 悬停是给「看」的，点击是给「改」的，两种意图各走各的路。
 *
 * 触摸设备没有悬停这个状态，自动退回点击。
 */
export function Menu({
  trigger,
  children,
  align = "start",
  width,
  hover = false,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  width?: number;
  hover?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** 在面板里点过了 —— 从「看」切到「改」，移开鼠标不再自动收 */
  const pinned = useRef(false);
  const timer = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    pinned.current = false;
    if (openHoverPanel === close) openHoverPanel = null;
    setOpen(false);
  };
  const popRef = useClickOutside<HTMLDivElement>(close, open);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const canHover = hover && typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const show = () => {
    if (hover) {
      openHoverPanel?.();
      openHoverPanel = close;
    }
    setOpen(true);
  };

  const schedule = (next: boolean) => {
    clearTimeout(timer.current);
    if (!next && pinned.current) return;
    timer.current = window.setTimeout(() => (next ? show() : close()), next ? HOVER_IN : HOVER_OUT);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const w = width ?? popRef.current?.offsetWidth ?? 220;
      const h = popRef.current?.offsetHeight ?? 200;
      let left = align === "end" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, width, popRef]);

  return (
    <>
      {trigger({
        onClick: () => {
          clearTimeout(timer.current);
          if (open) close();
          else {
            // 主动点开的当作「要改东西」，直接钉住
            pinned.current = true;
            show();
          }
        },
        "aria-expanded": open,
        ref: btnRef,
        ...(canHover ? { onPointerEnter: () => schedule(true), onPointerLeave: () => schedule(false) } : null),
      })}
      {open
        ? createPortal(
            <div
              className="pop"
              ref={popRef}
              style={{ top: pos.top, left: pos.left, width }}
              role="menu"
              {...(canHover
                ? {
                    onPointerEnter: () => clearTimeout(timer.current),
                    onPointerLeave: () => schedule(false),
                    // 点过就钉住。用捕获，免得子元素 stopPropagation 把它挡掉
                    onClickCapture: () => {
                      pinned.current = true;
                    },
                  }
                : null)}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

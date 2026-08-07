import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "@/lib/hooks";

/**
 * 下拉菜单。渲染到 body 上，免得被表格的 `overflow: auto` 裁掉；
 * 位置贴着触发元素，靠边时自动翻到另一侧。
 */
export function Menu({
  trigger,
  children,
  align = "start",
  width,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const [pos, setPos] = useState({ top: 0, left: 0 });

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
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, ref: btnRef })}
      {open
        ? createPortal(
            <div className="pop" ref={popRef} style={{ top: pos.top, left: pos.left, width }} role="menu">
              {children(() => setOpen(false))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

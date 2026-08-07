import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 全局气泡层。
 *
 * 原来的做法是 `[data-tip]::after` 画伪元素 —— 简单，但只要触发元素待在一个
 * `overflow: auto` 的容器里（比如表格的横向滚动区），气泡就会被容器裁掉半截。
 * 里程碑那几个节点正好在表格里，所以「装柜」的提示只露出一条黑边。
 *
 * 改成：整页只有一个气泡，挂在 body 上（不受任何祖先的 overflow 影响），
 * 靠事件委托监听 `[data-tip]`。**调用方一个字都不用改** —— 还是写 data-tip。
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const place = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const r = el.getBoundingClientRect();
      // 视口上方放不下就翻到下面 —— 顶栏的图标按钮全靠这一步
      const below = r.top < 56;
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      target.current = el;
    };

    const hide = () => {
      target.current = null;
      setTip(null);
    };

    const onOver = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (el === target.current) return;
      if (el) place(el);
      else hide();
    };

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    // 滚动时元素会移位，与其跟着重算不如直接收起来
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // 量出实际宽度之后再夹到视口内，避免贴边的那几列气泡跑出屏幕
  const style: React.CSSProperties = { left: tip?.x ?? 0, top: tip?.y ?? 0 };
  useEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const clamped = Math.max(8 + w / 2, Math.min(tip.x, window.innerWidth - 8 - w / 2));
    if (clamped !== tip.x) el.style.left = `${clamped}px`;
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div className="tip-layer" ref={ref} style={style} data-below={tip.below ? "1" : "0"} role="tooltip">
      {tip.text}
    </div>,
    document.body,
  );
}

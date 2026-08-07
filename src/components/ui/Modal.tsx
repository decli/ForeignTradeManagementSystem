import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useScrollLock } from "@/lib/hooks";

export function Modal({
  open,
  title,
  onClose,
  width = 480,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useScrollLock(open);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // 打开后把焦点送进对话框，键盘用户不会还留在背后的页面上
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={title} style={{ ["--modal-w" as string]: `${width}px` }}>
        <div className="modal-head">
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * 提示条。带撤销的那种会画一圈倒计时 —— 与其写「5 秒内可撤销」，
 * 不如把这 5 秒直接走给用户看。
 */

export type ToastItem = { id: number; text: string; undo?: () => void; tone?: "default" | "error"; seconds: number };

let seq = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(text: string, undo?: () => void, opts: { tone?: "default" | "error"; seconds?: number } = {}) {
  const item: ToastItem = { id: ++seq, text, undo, tone: opts.tone ?? "default", seconds: opts.seconds ?? (undo ? 6 : 3) };
  for (const fn of listeners) fn(item);
}

export const toastError = (text: string) => toast(text, undefined, { tone: "error", seconds: 4 });

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const on = (t: ToastItem) => setItems((prev) => [...prev.slice(-2), t]);
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);

  return createPortal(
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <Toast key={t.id} item={t} onDone={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [left, setLeft] = useState(item.seconds);
  const [out, setOut] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const tick = setInterval(() => setLeft((n) => n - 1), 1000);
    const end = setTimeout(() => setOut(true), item.seconds * 1000);
    const kill = setTimeout(() => done.current(), item.seconds * 1000 + 220);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
      clearTimeout(kill);
    };
  }, [item.seconds]);

  const C = 2 * Math.PI * 5.5;
  const frac = Math.max(0, left) / item.seconds;

  return (
    <div className="toast" data-out={out ? "1" : "0"}>
      {item.tone === "error" ? (
        <Icon name="alert" size={15} style={{ color: "var(--coral)" }} />
      ) : (
        <Icon name="check" size={15} style={{ color: "var(--jade)" }} />
      )}
      <span>{item.text}</span>
      {item.undo ? (
        <>
          <svg className="toast-ring" viewBox="0 0 14 14">
            <circle className="bg" cx="7" cy="7" r="5.5" />
            <circle className="fg" cx="7" cy="7" r="5.5" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round" />
          </svg>
          <button
            className="toast-undo"
            onClick={() => {
              item.undo?.();
              setOut(true);
              setTimeout(() => done.current(), 200);
            }}
          >
            撤销
          </button>
        </>
      ) : null}
    </div>
  );
}

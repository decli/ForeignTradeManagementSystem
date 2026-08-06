"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; undo?: () => void };

let seq = 0;
const listeners = new Set<(t: Toast) => void>();

/** 破坏性操作必须给撤销：传 undo 后提示条会多一个「撤销」按钮，5 秒内有效。 */
export function toast(message: string, undo?: () => void) {
  const t = { id: ++seq, message, undo };
  listeners.forEach((fn) => fn(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setItems((xs) => [...xs, t]);
      const ttl = t.undo ? 5200 : 2400;
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), ttl);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.message}</span>
          {t.undo ? (
            <button
              type="button"
              onClick={() => {
                t.undo!();
                dismiss(t.id);
              }}
            >
              撤销
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 带持久化的 useState。写坏了或存不进去都当没这回事，不能让一个偏好项拖垮页面。 */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 隐私模式：这次会话内仍然生效，只是关掉就没了 */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** 断点跟 CSS 里的一致：900 切浮层侧栏，768 切卡片视图 */
export const useIsMobile = () => useMediaQuery("(max-width: 900px)");
export const useIsNarrow = () => useMediaQuery("(max-width: 768px)");

type HotkeyOpts = { meta?: boolean; shift?: boolean; enabled?: boolean };

/** 全局快捷键。在输入框里默认不触发 —— 打字时按 n 不该弹出「新增」。 */
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, opts: HotkeyOpts = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  const { meta = false, shift = false, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta !== (e.metaKey || e.ctrlKey)) return;
      if (shift !== e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing && !meta) return;
      ref.current(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [key, meta, shift, enabled]);
}

export function useClickOutside<T extends HTMLElement>(onOut: () => void, enabled = true) {
  const ref = useRef<T>(null);
  const cb = useRef(onOut);
  cb.current = onOut;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    // 用 capture 才能抢在触发按钮自己的 onClick 之前关掉旧弹层
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled]);

  return ref;
}

/** 抽屉 / 模态打开时锁住背景滚动，同时补上滚动条宽度，避免页面横跳一下 */
export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
}

/** 每分钟走一次的时钟，顶栏的世界时间用 */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** 拖拽改尺寸：返回 onPointerDown，拖动中把 dragging 置 1 */
export function useDragResize(current: () => number, onChange: (v: number) => void, opts: { min: number; max: number; invert?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const state = useRef({ startX: 0, startV: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      state.current = { startX: e.clientX, startV: current() };
      setDragging(true);
    },
    [current],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const delta = (e.clientX - state.current.startX) * (opts.invert ? -1 : 1);
      onChange(Math.max(opts.min, Math.min(opts.max, state.current.startV + delta)));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, onChange, opts.min, opts.max, opts.invert]);

  return { dragging, onPointerDown };
}

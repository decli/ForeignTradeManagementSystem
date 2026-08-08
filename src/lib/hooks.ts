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

/**
 * 受控文本框，中文输入法下不会被打断。
 *
 * ── 症状 ──
 * 页面上的搜索框只能打英文。敲拼音，候选框刚冒出来就没了，一个汉字也上不去。
 * 偏偏右上角 ⌘K 那个搜索框好好的。
 *
 * ── 不是输入法的问题，是「这个框的值存在哪」的问题 ──
 * 出问题的框，值都存在地址栏参数里（useParam）。react-router v7 的
 * setSearchParams 是包在 startTransition 里的 —— 这次更新被降级成可打断的，
 * 本轮事件循环里**不提交**。而 React 在事件派发收尾时会做一次
 * restoreControlledState：发现 DOM 里的值跟上一次渲染的值对不上，就把
 * DOM 的 value **写回旧值**；等下一帧 transition 提交了，值再变回来。
 *
 * 拿浏览器实测过，敲一个 n 的瞬间：
 *   同步读 input.value → ""      ← 被写回去了
 *   一帧之后再读       → "n"
 *
 * 打英文时这一来一回你看不见，所以从没人发现。但对输入法来说，程序去写
 * input.value 就等同于宣布「合成结束」—— 拼音缓冲清空，候选框关闭。
 * 于是永远只能打出英文。⌘K 那个框用的是 useState，是紧急更新，
 * 同步就提交了，DOM 和渲染值始终一致，自然没事。
 *
 * ── 修法：让框在打字期间自己说了算 ──
 * 本地留一份镜像，渲染用镜像。这样每次按键都是一次紧急 setState，
 * React 提交完再去比对，值是对的，不会回写 DOM。外面传进来的值只在
 * 「不在合成中」且「确实是别人改的」时才采纳 —— 清空按钮、浏览器后退、
 * 切换筛选走的都是这条路。合成期间不往外传半截拼音：搜「ni」没有意义，
 * 还会让整张表白闪一下。
 */
export function useTextField(value: string, onChange: (v: string) => void) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  /** 上一次「认过」的外部值。自己发出去引起的回流不算外部改动 */
  const seen = useRef(value);

  if (value !== seen.current) {
    seen.current = value;
    // 渲染期改自己的 state 是 React 认可的「派生状态」写法，会立刻重跑本组件
    if (!composing.current && value !== local) setLocal(value);
  }

  const emit = (v: string) => {
    setLocal(v);
    seen.current = v;
    onChange(v);
  };

  return {
    value: local,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (composing.current) setLocal(e.target.value);
      else emit(e.target.value);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false;
      emit(e.currentTarget.value);
    },
    /** 外部要强改值（清空按钮、快捷筛选）走这个，绕开合成态 */
    set: emit,
  };
}

/** 每分钟走一次的时钟，顶栏的世界时间用 */
export function useTick(ms = 30_000) {
  const [n, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  /* 一定要把计数**返回出去**。
     早先写成 `const [, set]`，只靠重渲染推动界面 —— 而世界时间那边把行数据
     包在 useMemo([keys, lang]) 里，依赖里没有时间，缓存就永远不失效：
     顶栏每 30 秒确实重渲染一次，读到的却还是首帧那份，钟停在了打开页面的那一刻。
     计时器要想真的驱动谁，它的读数就得是那个 memo 的依赖。 */
  return n;
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

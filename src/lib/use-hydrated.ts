"use client";

import { useEffect, useState } from "react";

/**
 * 组件是否已经水合完成。
 *
 * 水合前 DOM 已经在页面上，但事件还没绑定——这时候点击 / 选择会静默失效。
 * 各个客户端组件是各自独立水合的，所以这个标记要打在真正持有事件处理器的
 * 那个组件上，端到端测试才能准确地等到「这块可以交互了」。
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

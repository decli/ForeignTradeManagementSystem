/**
 * 让卡片的光晕跟着鼠标走。
 *
 * 一个挂在 document 上的委托监听，不是每张卡各挂一个 —— 站内 KPI 卡有几十处，
 * 分散在七八个页面里，逐个接 onPointerMove 既啰嗦又容易漏。
 * 这里只往元素上写两个 CSS 变量，剩下的交给样式表：
 *
 *   --mx / --my   指针在卡片内的位置（百分比），聚光和边缘高光跟着它走
 *   --tx / --ty   由位置换算出的倾斜角（度），卡片朝指针那侧压下去
 *
 * 写变量而不是写 style.transform 的原因：CSS 那边还要叠 hover 的位移和缩放，
 * 两边都改 transform 会互相覆盖；交给 CSS 合成才不会打架。
 *
 * pointermove 频率很高，所以：
 *   · rAF 合帧，一帧最多写一次
 *   · 只在指针**换了一张卡**时才做 querySelector 之外的活
 *   · 触摸设备直接不启用 —— 没有悬停这个状态，白算
 */

const MAX_TILT = 3.2; // 度。再大就不像商业软件了，像游戏 UI

export function initSpotlight() {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let pending: PointerEvent | null = null;
  let raf = 0;
  let last: HTMLElement | null = null;

  const clear = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.removeProperty("--mx");
    el.style.removeProperty("--my");
    el.style.removeProperty("--tx");
    el.style.removeProperty("--ty");
  };

  const apply = () => {
    raf = 0;
    const e = pending;
    pending = null;
    if (!e) return;

    const card = (e.target as HTMLElement | null)?.closest?.(".kpi") as HTMLElement | null;
    if (card !== last) {
      clear(last);
      last = card;
    }
    if (!card) return;

    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", `${(px * 100).toFixed(2)}%`);
    card.style.setProperty("--my", `${(py * 100).toFixed(2)}%`);
    // 指针在右边 → 绕 Y 轴正向转（右侧压下去）；在下面 → 绕 X 轴反向转
    card.style.setProperty("--ty", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
    card.style.setProperty("--tx", `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      pending = e;
      if (!raf) raf = requestAnimationFrame(apply);
    },
    { passive: true },
  );

  // 指针整个离开窗口时把变量清掉，否则卡片会僵在最后一个角度上
  document.addEventListener("pointerleave", () => {
    clear(last);
    last = null;
  });
}

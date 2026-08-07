import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 横向滚动的两件事：**代理滚动条**，和**滚轮就近横滚**。
 *
 * 问题：宽表的横向滚动条长在表格容器的**底边**上。表格有几百像素高，
 * 页面往下滚一点，那条滚动条就跑到屏幕外面去了 —— 想看右边的列，
 * 得先滚到表格底部，找到滚动条，再横着拖回来。列越多越难受。
 *
 * 做法：表格底边被挤出视口时，在视口底部放一条等宽的代理滚动条，
 * 两边 scrollLeft 双向同步。用户看到的是「滚动条一直在手边」。
 *
 * ── 关键：热区跟着**当前那条**滚动条走 ──
 *
 * 页面往下滚到一半，表格底边会重新进入视口，代理条就交班给原生条隐退
 * （两条一起出现是干扰）。第一版把滚轮热区绑在代理条上，于是交班之后
 * 「悬停横滚」跟着一起消失 —— 用户的感受是「有时候有有时候没有」，
 * 而且怎么试都试不出规律。
 *
 * 现在热区认的是**有效滚动条的位置**：`min(表格底边, 视口底边)`。
 * 不管此刻在用的是代理条还是原生条，指针放到它上方一小段距离内，
 * 滚轮就是横向的。这才对得上「鼠标停在滚动条附近」这个说法。
 *
 * 为什么不用 position: sticky 直接钉住原生滚动条：
 * sticky 是相对**最近的滚动容器**定位的，而这里横滚的就是表格容器自己，
 * 钉不到视口上；外层 .grid-wrap 又有 overflow，sticky 到它身上等于没动。
 * 所以只能量一次几何、fixed 一条代理出来。
 *
 * 代理条只做位移，不复制内容 —— DOM 里就一个撑宽度的空 div，
 * 不管表格有多少列多少行，开销都是常数。
 */

/** 滚动条上方多高之内算「附近」。46px 约等于两行表格，够放松地停住 */
const HOT = 46;
/** 往下也留一点余量：指针压在滚动条本身、或再往下一点，仍然算 */
const HOT_BELOW = 22;

type Box = { left: number; width: number };

export function StickyXScroll({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  /** 代理条的位置。null = 此刻不该显示它（原生条就在视口里） */
  const [box, setBox] = useState<Box | null>(null);
  /** 表格到底有没有横向溢出。热区只看它，不看代理条显不显示 */
  const [scrollable, setScrollable] = useState(false);
  // 指针进了感应带就把条子加粗提亮 —— 不然「现在滚轮是横的」这件事没人知道
  const [near, setNear] = useState(false);
  /** 给滚轮回调用的实时几何。放 ref 里，免得每帧重挂监听 */
  const geom = useRef({ left: 0, right: 0, barTop: 0, on: false });
  // 两边互相 setScrollLeft 会打架，同步时用它把回声挡掉
  const echo = useRef(false);

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const overflows = el.scrollWidth - el.clientWidth > 2;
    const visible = r.top < vh && r.bottom > 0;

    setScrollable(overflows && visible);
    // 有效滚动条：表格底边还在视口里，用的就是原生那条；否则是贴底的代理条
    geom.current = { left: r.left, right: r.right, barTop: Math.min(r.bottom, vh), on: overflows && visible };

    /* 代理条只在「表格还看得见，但它的底边已经被挤出视口」时出现。
       底边还在屏幕里的话，原生滚动条就在那儿，再加一条是多余的干扰。 */
    const needProxy = overflows && r.bottom > vh - 12 && r.top < vh - 56;
    // 值没变就别 setState —— 否则页面每滚一帧都要重渲染一次
    setBox((prev) => {
      if (!needProxy) return prev === null ? prev : null;
      const next = { left: Math.round(r.left), width: Math.round(r.width) };
      return prev && prev.left === next.left && prev.width === next.width ? prev : next;
    });
    if (needProxy) {
      if (innerRef.current) innerRef.current.style.width = `${el.scrollWidth}px`;
      if (barRef.current && !echo.current) barRef.current.scrollLeft = el.scrollLeft;
    }
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let raf = 0;
    const schedule = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          measure();
        });
    };

    measure();
    /* 滚动事件**不冒泡**，而这个应用真正在滚的是外层 .canvas 不是 window。
       挂 window 的 scroll 收不到，得用捕获阶段在 document 上兜底 ——
       这样不管中间隔了几层滚动容器都能听见，也不用去找是哪一层在滚。 */
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(target);
    // 列宽拖动、密度切换会改 scrollWidth，但不触发上面任何一个事件
    const mo = new MutationObserver(schedule);
    mo.observe(target, { attributes: true, childList: true, subtree: true, attributeFilter: ["style", "class"] });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      mo.disconnect();
    };
  }, [targetRef, measure]);

  /* ── 滚轮就近横滚 ──
     只要表格有横向溢出就挂着，跟代理条显不显示无关。

     不铺一个透明 div 去接事件 —— 那会在滚动条上方压出一条吃点击的死区。
     wheel 事件自带 clientX/clientY，直接拿坐标判断就行，DOM 上不留痕迹。
     必须 passive: false，否则 preventDefault 拦不住页面纵向滚动。 */
  useEffect(() => {
    if (!scrollable) return;

    const inZone = (x: number, y: number) => {
      const g = geom.current;
      return g.on && x >= g.left && x <= g.right && y >= g.barTop - HOT && y <= g.barTop + HOT_BELOW;
    };

    const onWheel = (e: WheelEvent) => {
      const el = targetRef.current;
      if (!el || !inZone(e.clientX, e.clientY)) return;
      // 触控板本来就能横扫，只在它没给横向分量时才拿纵向来顶
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      const max = el.scrollWidth - el.clientWidth;
      // 已经顶到左右尽头就放行，让页面接着纵向滚 —— 不然手感像卡住了
      if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    const onMove = (e: PointerEvent) => setNear(inZone(e.clientX, e.clientY));

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      setNear(false);
    };
  }, [scrollable, targetRef]);

  /* 代理条隐退、用的是原生条时，"现在滚轮是横的"没有任何视觉提示 ——
     代理条那套加粗提亮的样式此刻根本没显示。所以把状态写到表格容器上，
     由 CSS 去点亮它的下边缘，两种情况的反馈才是一回事。 */
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    if (near) el.dataset.xhot = "1";
    else delete el.dataset.xhot;
    return () => {
      if (targetRef.current) delete targetRef.current.dataset.xhot;
    };
  }, [near, targetRef]);

  const onBarScroll = () => {
    const el = targetRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    echo.current = true;
    el.scrollLeft = bar.scrollLeft;
    requestAnimationFrame(() => (echo.current = false));
  };

  return (
    <div
      ref={barRef}
      className="grid-xbar"
      data-on={box ? "1" : "0"}
      data-near={near ? "1" : "0"}
      onScroll={onBarScroll}
      style={box ? { left: box.left, width: box.width } : undefined}
      aria-hidden="true"
    >
      <div ref={innerRef} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

/**
 * 贴在视口底部的横向滚动条。
 *
 * 问题：宽表的横向滚动条长在表格容器的**底边**上。表格有几百像素高，
 * 页面往下滚一点，那条滚动条就跑到屏幕外面去了 —— 想看右边的列，
 * 得先滚到表格底部，找到滚动条，再横着拖回来。列越多越难受。
 *
 * 做法：表格底边被挤出视口时，在视口底部放一条等宽的代理滚动条，
 * 两边 scrollLeft 双向同步。用户看到的是「滚动条一直在手边」。
 *
 * 为什么不用 position: sticky 直接钉住原生滚动条：
 * sticky 是相对**最近的滚动容器**定位的，而这里横滚的就是表格容器自己，
 * 钉不到视口上；外层 .grid-wrap 又有 overflow，sticky 到它身上等于没动。
 * 所以只能量一次几何、fixed 一条代理出来。
 *
 * 代理条只做位移，不复制内容 —— DOM 里就一个撑宽度的空 div，
 * 不管表格有多少列多少行，开销都是常数。
 */
export function StickyXScroll({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; scrollW: number } | null>(null);
  // 指针进了感应带就把条子加粗提亮 —— 不然「现在滚轮是横的」这件事没人知道
  const [near, setNear] = useState(false);
  // 两边互相 setScrollLeft 会打架，同步时用它把回声挡掉
  const echo = useRef(false);

  useEffect(() => {
    const target = targetRef.current;
    const bar = barRef.current;
    if (!target || !bar) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = targetRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const overflows = el.scrollWidth - el.clientWidth > 2;
      /* 只在「表格还看得见，但它的底边已经被挤出视口」时出现。
         底边还在屏幕里的话，原生滚动条就在那儿，再加一条是多余的干扰。 */
      const needed = overflows && r.bottom > vh - 12 && r.top < vh - 56;
      if (!needed) {
        setBox(null);
        return;
      }
      setBox({ left: r.left, width: r.width, scrollW: el.scrollWidth });
      if (innerRef.current) innerRef.current.style.width = `${el.scrollWidth}px`;
      if (barRef.current && !echo.current) barRef.current.scrollLeft = el.scrollLeft;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
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
  }, [targetRef]);

  /* ── 滚轮就近横滚 ──
     代理条只有 15px 高，非要用户瞄准它去拖，等于把问题从「找不到滚动条」
     换成了「够不着滚动条」。所以在它上方留一条 46px 的感应带：
     指针在带子里滚滚轮 = 横着滚表格，移出去立刻恢复成正常的上下滚。

     不铺一个透明 div 去接事件 —— 那会在视口底部压出一条吃点击的死区。
     wheel 事件自带 clientX/clientY，直接拿坐标判断就行，DOM 上不留痕迹。
     必须 passive: false，否则 preventDefault 拦不住页面纵向滚动。 */
  useEffect(() => {
    if (!box) return;
    const HOT = 46;
    const inZone = (x: number, y: number) =>
      y >= window.innerHeight - HOT && x >= box.left && x <= box.left + box.width;

    const onWheel = (e: WheelEvent) => {
      const el = targetRef.current;
      if (!el || !inZone(e.clientX, e.clientY)) return;
      // 触控板本来就能横扫，只在它没给横向分量时才拿纵向来顶
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!dx) return;
      e.preventDefault();
      el.scrollLeft += dx;
    };
    const onMove = (e: PointerEvent) => setNear(inZone(e.clientX, e.clientY));

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      setNear(false);
    };
  }, [box, targetRef]);

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

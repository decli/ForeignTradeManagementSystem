/**
 * 登录页背景的风场动画。
 *
 * 信风是大航海时代欧亚航线的动力，所以这里画的是一张**风场图** ——
 * 气象站（windy / ventusky）那种流线，而不是一张帆船插画。
 * 看起来像数据，不像壁纸，这是商业产品该有的分寸；
 * 同时它也正好是产品本身在说的事：货沿着既定航路走，全程看得见。
 *
 * 每条流线三层，共用同一段 `d`：
 *
 *   base   ── 整条淡线，是「航路」
 *   gust   ── 一小段亮线在跑，是「风」
 *   cargo  ── 零长度 + 圆头 = 一个光点，是「货」
 *
 * 三层都只动 `stroke-dashoffset`。关键是给 path 加 `pathLength="1000"`：
 * 虚线的长度单位被归一化成千分之一整条路径，于是
 * `dasharray: 64 936` 的周期正好等于一圈，offset 从 0 跑到 -1000 首尾严丝合缝，
 * 不用去量每条曲线的真实长度，换条曲线也不会出现接缝跳一下 ——
 * 下面鼠标一揉，曲线的真实长度每帧都在变，这条性质就更要紧了。
 *
 * 不用 SMIL（`animateMotion`）的原因：SMIL 不认 `prefers-reduced-motion`。
 * 位移动画全是 CSS，一条媒体查询就能整个停住。
 *
 * ── 向鼠标汇聚 ──
 * 固定方向的流动看久了是壁纸。真实的风场有低压中心，气流朝它卷进去 ——
 * 光标就是那个低压中心：每个采样点按「离光标多近」被拉过去一截，
 * 高斯衰减，远处纹丝不动，近处明显偏折，正好在光标附近收成一束。
 * 光标本身受力为零（自己到自己的距离是 0），所以线是**绕着**它收拢，
 * 不会塌成一个点。
 */

import { useEffect, useRef } from "react";

type Lane = {
  /** 左端起点高度，viewBox 坐标 */
  y: number;
  /** 中段起伏幅度 —— 让流线像风而不像铁轨 */
  amp: number;
  /** 从左到右总体抬升多少：信风是斜着吹的 */
  rise: number;
  /** 跑完一圈的秒数 */
  dur: number;
  delay: number;
  /** 这条线上带不带货点 */
  cargo?: boolean;
};

/** 画布。宽屏比例，因为它现在铺满整个登录页而不只是左半边 */
const VB_W = 1440;
const VB_H = 900;

/* 手写而非随机：随机数每次刷新都换一张脸，而这是品牌资产，
   应该每次都长一样。疏密也是调过的 —— 中间几条稍密，正好在标题背后。
   起点 y 铺到画布下方，因为流线整体向右上抬升，不然右下角会空一大片。 */
const LANES: Lane[] = [
  { y: 60, amp: 30, rise: 92, dur: 17, delay: -4 },
  { y: 148, amp: 34, rise: 96, dur: 15, delay: -2 },
  { y: 236, amp: 20, rise: 132, dur: 19, delay: -9, cargo: true },
  { y: 330, amp: 40, rise: 104, dur: 13, delay: -5 },
  { y: 404, amp: 26, rise: 152, dur: 22, delay: -14, cargo: true },
  { y: 512, amp: 44, rise: 88, dur: 16, delay: -1 },
  { y: 596, amp: 28, rise: 140, dur: 25, delay: -18, cargo: true },
  { y: 690, amp: 36, rise: 112, dur: 14, delay: -7 },
  { y: 782, amp: 30, rise: 162, dur: 18, delay: -11, cargo: true },
  { y: 878, amp: 24, rise: 120, dur: 21, delay: -3 },
  { y: 972, amp: 38, rise: 100, dur: 20, delay: -13 },
  { y: 1066, amp: 30, rise: 172, dur: 27, delay: -21, cargo: true },
];

type Pt = [number, number];

/* 采样点数。26 段折线重新拟合成曲线，肉眼看不出是折的；
   再多只是白烧 CPU —— 每帧要为 12 条线各算一遍。 */
const SAMPLES = 26;

const cube = (a: number, b: number, c: number, d: number, t: number) => {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
};

const at = (s: Pt[], t: number): Pt => [cube(s[0][0], s[1][0], s[2][0], s[3][0], t), cube(s[0][1], s[1][1], s[2][1], s[3][1], t)];

/**
 * 一条流线的静止形状，采样成折线。
 *
 * 左右都伸到画布外面，看不见端点，流线就是「穿过」画面而不是「停」在里面。
 * 第二段的第一个控制点是第一段末控制点关于接点的反射 ——
 * 也就是 SVG 里 `S` 指令替你做的那件事，这里要自己算，因为要采样。
 */
function lanePoints({ y, amp, rise }: Lane): Pt[] {
  const s1: Pt[] = [
    [-170, y],
    [170, y - amp],
    [475, y + amp * 0.7],
    [760, y - rise * 0.45],
  ];
  const s2: Pt[] = [
    s1[3],
    [2 * s1[3][0] - s1[2][0], 2 * s1[3][1] - s1[2][1]],
    [1310, y - rise * 0.95],
    [1610, y - rise],
  ];
  const half = SAMPLES >> 1;
  const pts: Pt[] = [];
  for (let i = 0; i <= half; i++) pts.push(at(s1, i / half));
  for (let i = 1; i <= half; i++) pts.push(at(s2, i / half));
  return pts;
}

/** 折线 → 平滑曲线（Catmull-Rom 转三次贝塞尔）。揉过之后还得是一条顺的线 */
function smooth(p: Pt[]): string {
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i];
    const b = p[i];
    const c = p[i + 1];
    const e = p[i + 2] ?? c;
    d +=
      `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)}` +
      ` ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)}` +
      ` ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}

/** 汇聚半径与最大拉扯比例。R 太小只有一两条线动，太大整张图一起歪 */
const R = 330;
const PULL = 0.58;

const REST = LANES.map(lanePoints);
const REST_D = REST.map(smooth);

export function BrandWind() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;
    /* 关掉动效的人不该被一个跟着鼠标跑的背景追着 */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lanes = LANES.map((_, i) => Array.from(svg.querySelectorAll<SVGPathElement>(`path[data-lane="${i}"]`)));
    const eye = svg.querySelector<SVGCircleElement>(".wind-eye");

    /* cur 是**平滑后**的光标：直接用原始坐标，线会跟着指针一格一格地跳；
       每帧向目标靠近一小步，风场就有了惯性，像被吹过去而不是被拖过去。 */
    let cur = { x: VB_W * 0.5, y: VB_H * 0.5 };
    let aim = { ...cur };
    let k = 0;
    let aimK = 0;
    let raf = 0;
    let ctm: DOMMatrix | null = null;

    const toViewBox = (clientX: number, clientY: number) => {
      ctm ??= svg.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    };

    const frame = () => {
      raf = 0;
      /* 进场快、离场慢。风被吸过去是立刻的事（0.13，约 15 帧到位），
         松开却要缓（0.045，约 1 秒）—— 鼠标划出去时啪地弹回原位很廉价。 */
      cur.x += (aim.x - cur.x) * 0.16;
      cur.y += (aim.y - cur.y) * 0.16;
      k += (aimK - k) * (aimK > k ? 0.13 : 0.045);

      for (let i = 0; i < REST.length; i++) {
        const rest = REST[i];
        const warped: Pt[] = new Array(rest.length);
        for (let j = 0; j < rest.length; j++) {
          const [x, y] = rest[j];
          const dx = cur.x - x;
          const dy = cur.y - y;
          /* 高斯衰减：远处系数趋近 0，静止形状原样保留，
             近处最多把这个点拉走到光标距离的 PULL 倍。 */
          const w = Math.exp(-(dx * dx + dy * dy) / (R * R)) * k;
          warped[j] = w < 0.002 ? rest[j] : [x + dx * w * PULL, y + dy * w * PULL];
        }
        const d = smooth(warped);
        for (const p of lanes[i]) p.setAttribute("d", d);
      }

      if (eye) {
        eye.setAttribute("cx", cur.x.toFixed(1));
        eye.setAttribute("cy", cur.y.toFixed(1));
        eye.setAttribute("opacity", (k * 0.9).toFixed(3));
      }

      /* 收敛了就停 rAF —— 一个登录页不该在没人动鼠标的时候还满帧空转 */
      const settled = Math.abs(aimK - k) < 0.001 && (k < 0.001 || (Math.abs(aim.x - cur.x) < 0.4 && Math.abs(aim.y - cur.y) < 0.4));
      if (!settled) raf = requestAnimationFrame(frame);
      else if (k < 0.001 && aimK === 0) {
        /* 完全归位时把 d 写回静止值，避免留下 0.1 单位的残余偏移 */
        for (let i = 0; i < lanes.length; i++) for (const p of lanes[i]) p.setAttribute("d", REST_D[i]);
      }
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      /* 触屏上 pointermove 只在手指按住时才有，跟着做会很怪；这个特效是给鼠标的 */
      if (e.pointerType === "touch") return;
      const p = toViewBox(e.clientX, e.clientY);
      if (!p) return;
      aim = p;
      /* 第一次进来别从画布中心飞过去 */
      if (aimK === 0) cur = { ...p };
      aimK = 1;
      kick();
    };
    const onLeave = () => {
      aimK = 0;
      kick();
    };
    const onResize = () => {
      ctm = null;
    };

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onResize, { passive: true });

    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="wind"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* 两头淡出，流线才像被裁的一段风，而不是画到边上戛然而止 */}
        <linearGradient id="tw-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.1" stopColor="#fff" />
          <stop offset="0.88" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="tw-mask">
          <rect width={VB_W} height={VB_H} fill="url(#tw-fade)" />
        </mask>
        {/* 低压中心：光标处一团极淡的光。没有它，线朝一个看不见的点收拢，
            像是画错了；有了它，那里就是一个「气旋眼」。 */}
        <radialGradient id="tw-eye">
          <stop offset="0" stopColor="var(--brand-2)" stopOpacity="0.2" />
          <stop offset="0.55" stopColor="var(--brand-2)" stopOpacity="0.06" />
          <stop offset="1" stopColor="var(--brand-2)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g mask="url(#tw-mask)">
        <circle className="wind-eye" r={R * 0.95} cx={VB_W / 2} cy={VB_H / 2} fill="url(#tw-eye)" opacity="0" />
        {LANES.map((lane, i) => {
          const d = REST_D[i];
          const style = { "--dur": `${lane.dur}s`, "--delay": `${lane.delay}s` } as React.CSSProperties;
          return (
            <g key={i}>
              <path className="wind-base" data-lane={i} d={d} pathLength={1000} />
              <path className="wind-gust" data-lane={i} d={d} pathLength={1000} style={style} />
              {lane.cargo ? <path className="wind-cargo" data-lane={i} d={d} pathLength={1000} style={style} /> : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

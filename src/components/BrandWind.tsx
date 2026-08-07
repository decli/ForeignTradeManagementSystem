/**
 * 登录页左侧的风场动画。
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
 * `dasharray: 70 930` 的周期正好等于一圈，offset 从 0 跑到 -1000 首尾严丝合缝，
 * 不用去量每条曲线的真实长度，换条曲线也不会出现接缝跳一下。
 *
 * 不用 SMIL（`animateMotion`）的原因：SMIL 不认 `prefers-reduced-motion`。
 * 这里全是 CSS 动画，一条媒体查询就能整个停住。
 */

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

/* 手写而非随机：随机数每次刷新都换一张脸，而这是品牌资产，
   应该每次都长一样。疏密也是调过的 —— 中间几条稍密，正好在标题背后。 */
const LANES: Lane[] = [
  { y: 96, amp: 34, rise: 96, dur: 15, delay: -2 },
  { y: 176, amp: 20, rise: 132, dur: 19, delay: -9, cargo: true },
  { y: 300, amp: 40, rise: 104, dur: 13, delay: -5 },
  { y: 358, amp: 26, rise: 152, dur: 22, delay: -14, cargo: true },
  { y: 486, amp: 44, rise: 88, dur: 16, delay: -1 },
  { y: 562, amp: 28, rise: 140, dur: 25, delay: -18, cargo: true },
  { y: 700, amp: 36, rise: 112, dur: 14, delay: -7 },
  { y: 784, amp: 30, rise: 162, dur: 18, delay: -11, cargo: true },
  { y: 918, amp: 24, rise: 120, dur: 21, delay: -3 },
  { y: 1012, amp: 30, rise: 172, dur: 27, delay: -21, cargo: true },
];

/* 左右都伸到 viewBox 外面，看不见端点，流线就是「穿过」画面而不是「停」在里面 */
const laneD = ({ y, amp, rise }: Lane) =>
  `M -90 ${y} C 90 ${y - amp}, 250 ${y + amp * 0.7}, 400 ${y - rise * 0.45}` +
  ` S 690 ${y - rise * 0.95}, 850 ${y - rise}`;

export function BrandWind() {
  return (
    <svg
      className="wind"
      viewBox="0 0 760 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* 两头淡出，流线才像被裁的一段风，而不是画到边上戛然而止 */}
        <linearGradient id="tw-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.16" stopColor="#fff" />
          <stop offset="0.74" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="tw-mask">
          <rect width="760" height="900" fill="url(#tw-fade)" />
        </mask>
      </defs>

      <g mask="url(#tw-mask)">
        {LANES.map((lane, i) => {
          const d = laneD(lane);
          const style = { "--dur": `${lane.dur}s`, "--delay": `${lane.delay}s` } as React.CSSProperties;
          return (
            <g key={i}>
              <path className="wind-base" d={d} pathLength={1000} />
              <path className="wind-gust" d={d} pathLength={1000} style={style} />
              {lane.cargo ? <path className="wind-cargo" d={d} pathLength={1000} style={style} /> : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

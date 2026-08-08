/**
 * 手写 SVG 图表。
 *
 * 不引图表库的理由很实际：这里只需要三种图，而任何一个主流库的体积都超过
 * 整个应用的其余部分；而且库的默认配色会自带一套跟设计令牌打架的色板，
 * 深色模式还要再改一遍。手写的这几十行反而更省事。
 */

import { useWidth } from "@/lib/hooks";
import { formatCompact } from "@/lib/format";
import { tr } from "@/i18n";

/** KPI 卡背景上的那条趋势线 */
export function Sparkline({ values, tone = "accent" }: { values: number[]; tone?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - ((v - min) / span) * 26]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${d} L100 34 L0 34 Z`;
  return (
    <svg className="kpi-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={`var(--${tone})`} opacity="0.1" />
      <path d={d} fill="none" stroke={`var(--${tone})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 刻度上界取整。
 *
 * 原来直接拿数据最大值当上界，刻度就成了「13 / 10 / 7 / 3 / 0」——
 * 中间那几个是 9.75、6.5、3.25 四舍五入来的，既不好读也不好比。
 * 取整之后是「16 / 12 / 8 / 4 / 0」，每格一个整数，柱子也不会顶到天花板。
 */
function niceMax(max: number, steps = 4) {
  if (!(max > 0)) return 1;
  const raw = max / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * mag;
  return step * steps;
}

/* 轴标签用等宽字体（.chart-svg text { font-family: var(--mono) }），
   每个字形宽度一样，所以字数 × 字宽就是准确宽度，不用去 DOM 里量。
   9.5px 的等宽字，单字进距约 0.6em。留一点余量防止字体回退到稍宽的一款。 */
const GLYPH = 6;
const labelW = (s: string) => s.length * GLYPH;

/**
 * 月度出运柱 + 签约额折线。
 *
 * ── 为什么不用固定 viewBox ──
 * 原来是 `viewBox="0 0 620 190"` + `width:100%`，让浏览器把整张图缩放到容器宽度。
 * 在 1900px 宽的看板上，缩放系数是 3 —— 9.5px 的轴标签印出来 29px，
 * 2px 的折线粗成 6px，柱子宽成一堵墙。图表跟着容器一起"发胖"，
 * 跟同一屏上 13px 的表格、12px 的卡片标题完全不是一套比例，
 * 于是它看着像从别的产品里贴过来的。
 *
 * 现在按容器的**真实像素**作图：1 个用户单位 = 1 个 CSS 像素。
 * 字号、线宽、柱宽全部锁死在设计值上，容器变宽只是绘图区变宽 ——
 * 数据点之间松一些，别的什么都不变。这也是所有正经图表库的做法。
 */
export function MonthlyChart({ data }: { data: { label: string; count: number; amount: number }[] }) {
  const [box, W] = useWidth<HTMLDivElement>();
  /* 高度跟着宽度走，但两头都封死。固定高度在 1100px 宽的卡片里会摊成一条
     6:1 的带子，趋势的起伏被压平了看不出来；完全按比例又会在超宽屏上顶到半屏。 */
  const H = Math.round(Math.max(180, Math.min(240, W * 0.2)));
  const padB = 24;
  const padT = 14;

  const TICKS = [0, 0.25, 0.5, 0.75, 1];
  const maxCount = niceMax(Math.max(...data.map((d) => d.count), 1));
  const maxAmount = niceMax(Math.max(...data.map((d) => d.amount), 1));
  const leftLabels = TICKS.map((f) => String(Math.round(maxCount * (1 - f))));
  const rightLabels = TICKS.map((f) => formatCompact(maxAmount * (1 - f)));

  /* ── 留白按内容算，不写死 ──
     右上角那个 $803.4K 原来是 `x = W - padR + 6` 摆的：padR 写死 38，
     标签却随金额长短变（$0 两个字符，$1.27M 六个，¥12,345,678 十一个）。
     金额一大就顶出 viewBox，而 .chart-svg 是 overflow:visible，
     于是它直接跑到卡片边框外面去了。
     现在两侧留白都由「最长的那条标签」决定，换分辨率、换币种、
     数字翻一百倍都不会溢出 —— 溢出这件事从结构上就不成立了。 */
  const padL = Math.max(...leftLabels.map(labelW)) + 9;
  const padR = Math.max(...rightLabels.map(labelW)) + 9;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  /* 柱宽封顶。8 个月的时候一格 200px，按比例算柱子会宽到 88px ——
     那不是柱状图，是色块。封在 26px：看板上的柱子只要够比高矮就行。 */
  const bw = Math.min(26, (iw / data.length) * 0.42);

  const x = (i: number) => padL + (iw / data.length) * (i + 0.5);
  const yBar = (v: number) => padT + ih - (v / maxCount) * ih;
  const yLine = (v: number) => padT + ih - (v / maxAmount) * ih;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yLine(d.amount).toFixed(1)}`).join(" ");

  return (
    <div ref={box}>
      {/* 宽度还没量到之前先不画：0 宽度会让所有坐标算成 NaN，
          SVG 里出现 NaN 的后果是整条 path 静默消失，比空着更难查 */}
      {W < 80 ? (
        <div className="chart-skel" style={{ height: H }} />
      ) : (
        <svg className="chart-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("月度出运柜量与签约额")}>
          {/* ── 两条轴，各自染成自己那条数据的颜色 ──
            双轴图最容易出的错是读者不知道哪个数字配哪条线。原来左边一列
            13/10/7/3/0 是中性灰，右上角孤零零一个绿色数字 —— 那个数字既不像
            轴也不像数据点，实际上是「折线的量程上限」，没人猜得到。
            现在左轴＝柱子色、右轴＝折线色，跟下面的图例是同一套颜色。 */}
          {TICKS.map((f, k) => (
            <g key={f}>
              <line className="grid-line" x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f} />
              <text className="axis-a" x={padL - 7} y={padT + ih * f + 3} textAnchor="end">
                {leftLabels[k]}
              </text>
              <text className="axis-b" x={W - padR + 7} y={padT + ih * f + 3} textAnchor="start">
                {rightLabels[k]}
              </text>
            </g>
          ))}
          {data.map((d, i) => (
            /* bar-hit 是一条贯穿全高的透明命中区：柱子矮的时候（比如只出运 1 票）
               实际可悬停的高度只有几像素，鼠标很难对上。加了它，整列都能悬停。 */
            <g key={d.label} className="bar-g">
              <rect className="bar-hit" x={x(i) - bw} y={padT} width={bw * 2} height={ih} rx="4" />
              <rect className="bar-a" x={x(i) - bw / 2} y={yBar(d.count)} width={bw} height={Math.max(1, padT + ih - yBar(d.count))} rx="3">
                <title>{tr("{m} 出运 {n} 票 · 签约 {v}", { m: d.label, n: d.count, v: formatCompact(d.amount) })}</title>
              </rect>
              <text x={x(i)} y={H - 6} textAnchor="middle">
                {d.label}
              </text>
            </g>
          ))}
          <path className="line-a" d={line} />
          {data.map((d, i) => (
            <circle key={d.label} className="line-dot" cx={x(i)} cy={yLine(d.amount)} r="2.6">
              <title>{tr("{m} 签约 {v}", { m: d.label, v: formatCompact(d.amount) })}</title>
            </circle>
          ))}
        </svg>
      )}
      {/* 图例的色块必须跟图上真实的颜色一样。柱子退成 34% 之后图例还留着满饱和，
          等于告诉读者"那个深色块是柱子"，而图上根本没有那个颜色。 */}
      <div className="chart-legend" style={{ marginTop: 8 }}>
        <span>
          <i style={{ background: "color-mix(in srgb, var(--accent) 34%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)" }} />
          {tr("出运柜量（票）")}
        </span>
        <span>
          <i style={{ background: "var(--jade)" }} />
          {tr("当月签约额（USD）")}
        </span>
      </div>
    </div>
  );
}

/** 横向条形：目的国 TOP、利润率分布都用它 */
export function BarList({
  data,
  format = (v: number) => String(v),
}: {
  data: { name: string; value: number; tone?: string }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="rank">
      {data.map((d) => (
        <div className="rank-row" key={d.name}>
          <span className="rank-name truncate">{d.name}</span>
          <span className="rank-val">{format(d.value)}</span>
          <div className="bar">
            <i style={{ width: `${(d.value / max) * 100}%`, background: d.tone ? `var(--${d.tone})` : undefined }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 成本构成堆叠条 */
export function StackBar({ items }: { items: { label: string; value: number; tone: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div>
      <div className="stack">
        {items.map((i) => (
          <i key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: `var(--${i.tone})` }} title={`${i.label} ${formatCompact(i.value, "¥")}`} />
        ))}
      </div>
      <div className="stack-legend">
        {items.map((i) => (
          <div key={i.label}>
            <i style={{ background: `var(--${i.tone})` }} />
            <span>{i.label}</span>
            <b>¥{Math.round(i.value).toLocaleString("en-US")}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 环形进度：中信保额度、回款进度 */
export function Ring({ value, max, tone = "accent", size = 56, label }: { value: number; max: number; tone?: string; size?: number; label?: string }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(frac * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`var(--${tone})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .4s cubic-bezier(.32,.72,0,1)" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--text)", fontSize: size / 4.4, fontWeight: 650 }}>
        {Math.round(frac * 100)}%
      </text>
    </svg>
  );
}

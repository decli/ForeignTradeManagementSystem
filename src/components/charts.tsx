/**
 * 手写 SVG 图表。
 *
 * 不引图表库的理由很实际：这里只需要三种图，而任何一个主流库的体积都超过
 * 整个应用的其余部分；而且库的默认配色会自带一套跟设计令牌打架的色板，
 * 深色模式还要再改一遍。手写的这几十行反而更省事。
 */

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

/** 月度出运柱 + 订单额折线 */
export function MonthlyChart({ data }: { data: { label: string; count: number; amount: number }[] }) {
  const W = 620;
  const H = 190;
  const padL = 34;
  const padR = 38;
  const padB = 22;
  const padT = 12;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const bw = (iw / data.length) * 0.44;

  const x = (i: number) => padL + (iw / data.length) * (i + 0.5);
  const yBar = (v: number) => padT + ih - (v / maxCount) * ih;
  const yLine = (v: number) => padT + ih - (v / maxAmount) * ih;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yLine(d.amount).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="月度出运柜量与订单额">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f} />
            <text x={padL - 6} y={padT + ih * f + 3} textAnchor="end">
              {Math.round(maxCount * (1 - f))}
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
          <circle key={d.label} cx={x(i)} cy={yLine(d.amount)} r="2.8" fill="var(--surface)" stroke="var(--jade)" strokeWidth="2">
            <title>{tr("{m} 签约 {v}", { m: d.label, v: formatCompact(d.amount) })}</title>
          </circle>
        ))}
        <text x={W - padR + 6} y={padT + 3} textAnchor="start" style={{ fill: "var(--jade)" }}>
          {formatCompact(maxAmount)}
        </text>
      </svg>
      <div className="chart-legend" style={{ marginTop: 8 }}>
        <span>
          <i style={{ background: "var(--accent)" }} />
          出运柜量（票）
        </span>
        <span>
          <i style={{ background: "var(--jade)" }} />
          当月签约额（USD）
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

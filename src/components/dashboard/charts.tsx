/**
 * 看板图表。纯 SVG 服务端渲染，没有图表库依赖，也没有客户端 JS。
 * 数据量是「8 个月 × 2 个序列」这种规模，够用且首屏更快。
 */

export function TrendChart({ data }: { data: { label: string; count: number; amount: number }[] }) {
  const W = 560;
  const H = 210;
  const PL = 36;
  const PR = 12;
  const PT = 12;
  const PB = 26;
  const iw = W - PL - PR;
  const ih = H - PT - PB;

  const maxCount = Math.max(4, ...data.map((d) => d.count));
  const maxAmount = Math.max(1, ...data.map((d) => d.amount));
  // 纵轴取整到好读的刻度，免得出现 37.4 这种轴标
  const step = Math.ceil(maxCount / 4);
  const top = step * 4;

  const bw = (iw / data.length) * 0.5;
  const cx = (i: number) => PL + (iw / data.length) * (i + 0.5);

  const points = data.map((d, i) => [cx(i), PT + ih - (d.amount / maxAmount) * ih] as const);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="月度出运柜量与订单额趋势">
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={PL}
          x2={W - PR}
          y1={PT + (ih / 4) * i}
          y2={PT + (ih / 4) * i}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <text
          key={i}
          x={PL - 7}
          y={PT + ih - (ih / 4) * i + 3.5}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-3)"
          style={{ fontFamily: "var(--mono)" }}
        >
          {step * i}
        </text>
      ))}
      {data.map((d, i) => {
        const h = top ? (d.count / top) * ih : 0;
        return (
          <rect
            key={d.label}
            x={cx(i) - bw / 2}
            y={PT + ih - h}
            width={bw}
            height={h}
            rx="3"
            fill="var(--accent)"
            opacity="0.2"
          >
            <title>{`${d.label}：出运 ${d.count} 柜`}</title>
          </rect>
        );
      })}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === points.length - 1 ? 4 : 2.6}
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth="2"
        >
          <title>{`${data[i].label}：订单额 $${Math.round(data[i].amount).toLocaleString("en-US")}`}</title>
        </circle>
      ))}
      {data.map((d, i) => (
        <text key={d.label} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

export function ProfitDistribution({ data }: { data: { label: string; tone: string; count: number }[] }) {
  const W = 300;
  const H = 160;
  const pad = 26;
  const max = Math.max(1, ...data.map((d) => d.count));
  const bw = ((W - pad) / data.length) * 0.6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="订单利润率分布">
      <line x1={pad} x2={W} y1={H - 22} y2={H - 22} stroke="var(--line)" />
      {data.map((d, i) => {
        const x = pad + ((W - pad) / data.length) * (i + 0.5) - bw / 2;
        const h = (d.count / max) * (H - 34);
        return (
          <g key={d.label}>
            <rect x={x} y={H - 22 - h} width={bw} height={h} rx="3" fill={`var(--${d.tone})`} opacity="0.85" />
            <text
              x={x + bw / 2}
              y={H - 26 - h}
              textAnchor="middle"
              fontSize="10.5"
              fill="var(--text-2)"
              style={{ fontFamily: "var(--mono)" }}
            >
              {d.count}
            </text>
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

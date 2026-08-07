import type { MilestoneView } from "@/data/queries";

/**
 * 签名组件：里程碑航程线。
 *
 * 原始台账里是四个孤立的圆点 —— 看得出哪几步填了日期，看不出这票走到哪。
 * 这里把它们连成一条带进度填充的线：已完成实心，当前节点带光晕，
 * 计划日已过还没确认的转珊瑚红，悬停出「计划 vs 实际」。
 *
 * 两个版本：`rail` 用在表格里（有日期、有标签），`dots` 用在窄屏卡片和抽屉标题旁，
 * 只剩五个点，宽度 60px 也能表达「走到第几步」。
 */
export function MilestoneRail({ milestones, compact = false }: { milestones: MilestoneView[]; compact?: boolean }) {
  const n = milestones.length;
  if (n === 0) return <span className="muted">—</span>;

  // 最后一个已发生的节点决定进度条填到哪
  let lastDone = -1;
  milestones.forEach((m, i) => {
    if (m.state === "done") lastDone = i;
  });

  if (compact) {
    return (
      <span className="mdots" title={milestones.map((m) => `${m.kind} ${m.value}`).join("  ·  ")}>
        {milestones.map((m) => (
          <i key={m.kind} data-s={m.state} />
        ))}
      </span>
    );
  }

  // 圆点落在每一列中心，所以轨道两端各留半列
  const half = 100 / (2 * n);
  const span = 100 - 2 * half;
  const frac = n > 1 ? Math.max(0, lastDone) / (n - 1) : 0;

  return (
    <div className="mrail">
      <div className="mrail-track" aria-hidden="true">
        <span className="mrail-line" style={{ left: `${half}%`, right: `${half}%` }} />
        <span className="mrail-fill" style={{ left: `${half}%`, width: `${(span * frac).toFixed(2)}%` }} />
      </div>
      <div className="mrail-nodes" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {milestones.map((m) => (
          <span className="mnode" data-s={m.state} key={m.kind} data-tip={`${m.kind}｜${m.tip}`} tabIndex={0}>
            <span className="mdot" aria-hidden="true" />
            <span className="ml">{m.kind}</span>
            <span className="mv">{m.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 签名组件：里程碑航程线。
 *
 * 截图里原本是四个孤立圆点——看得出哪几步有日期，看不出这票走到哪。
 * 这里把它们连成一条带进度填充的线：已完成的节点实心，当前节点带光晕，
 * 超期未确认的转珊瑚红，悬停出「计划 vs 实际」。
 */

export type MilestoneState = "done" | "now" | "late" | "pending";

export type MilestoneView = {
  kind: string;
  /** 展示用的紧凑日期，如 8.21；没有则为 — */
  value: string;
  state: MilestoneState;
  tip: string;
};

export function MilestoneRail({ milestones }: { milestones: MilestoneView[] }) {
  const n = milestones.length;
  if (n === 0) return <span style={{ color: "var(--text-3)" }}>—</span>;

  // 最后一个已发生的节点决定进度条填到哪
  let lastDone = -1;
  milestones.forEach((m, i) => {
    if (m.state === "done" || m.state === "late") lastDone = i;
  });

  // 圆点落在每一列的中心，所以轨道两端各留半列
  const half = 100 / (2 * n);
  const span = 100 - 2 * half;
  const frac = n > 1 ? Math.max(0, lastDone) / (n - 1) : 0;

  return (
    <div className="mrail">
      <div className="mrail-track" aria-hidden="true">
        <span className="mrail-line" style={{ left: `${half}%`, right: `${half}%` }} />
        <span className="mrail-fill" style={{ left: `${half}%`, width: `${(span * frac).toFixed(2)}%` }} />
      </div>
      <div className="mrail-nodes" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {milestones.map((m) => (
          <button type="button" className="mnode" data-s={m.state} key={m.kind} title={m.tip}>
            <span className="mdot" aria-hidden="true" />
            <span className="ml">{m.kind}</span>
            <span className="mv">{m.value}</span>
            <span className="tip">
              {m.kind}｜{m.tip}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

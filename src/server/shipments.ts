import { db } from "@/lib/db";
import { shortDate, isoDate } from "@/lib/format";
import type { MilestoneView, MilestoneState } from "@/components/milestone-rail";

export type ShipmentRow = {
  id: string;
  batchNo: string;
  batchLabel: string | null;
  country: string;
  term: string;
  mode: string;
  fcl: boolean;
  containerNo: string | null;
  carrier: string | null;
  pod: string | null;
  releaseState: string;
  salesName: string;
  team: string | null;
  latestNote: string | null;
  latestNoteOn: string | null;
  hasTodo: boolean;
  piNo: string | null;
  customerName: string | null;
  milestones: MilestoneView[];
  /** 超过 7 天没有新动态就算停滞，0 表示正常 */
  stalledDays: number;
  hasLate: boolean;
};

export type ShipmentFilters = {
  q?: string;
  releaseState?: string;
  sales?: string;
  onlyActive?: boolean;
};

const DAY = 86_400_000;

function daysBetween(a: Date, b: Date) {
  return Math.floor(
    (Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) -
      Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) /
      DAY,
  );
}

/**
 * 节点状态：
 *  - 有实际发生日期 → done
 *  - 第一个未发生的节点 → 计划日已过 late，否则 now
 *  - 其余未发生的 → pending
 */
function toMilestoneViews(
  rows: { kind: string; seq: number; plannedOn: Date | null; actualOn: Date | null }[],
  today: Date,
): MilestoneView[] {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const firstOpen = sorted.findIndex((m) => !m.actualOn);

  return sorted.map((m, i) => {
    let state: MilestoneState;
    let tip: string;

    if (m.actualOn) {
      state = "done";
      tip = `实际 ${isoDate(m.actualOn)} 已完成`;
    } else if (i === firstOpen) {
      const overdue = m.plannedOn ? m.plannedOn.getTime() < today.getTime() : false;
      state = overdue ? "late" : "now";
      tip = m.plannedOn
        ? `计划 ${isoDate(m.plannedOn)}，${overdue ? "已超期未确认" : "进行中"}`
        : "尚未安排";
    } else {
      state = "pending";
      tip = m.plannedOn ? `计划 ${isoDate(m.plannedOn)}` : "尚未安排";
    }

    return { kind: m.kind, value: shortDate(m.actualOn ?? m.plannedOn), state, tip };
  });
}

export async function listShipments(filters: ShipmentFilters = {}): Promise<ShipmentRow[]> {
  const { q, releaseState, sales, onlyActive } = filters;

  const rows = await db.shipment.findMany({
    where: {
      archived: false,
      ...(releaseState ? { releaseState } : {}),
      ...(sales ? { sales: { name: sales } } : {}),
      ...(q
        ? {
            OR: [
              { batchNo: { contains: q } },
              { containerNo: { contains: q } },
              { country: { contains: q } },
              { pi: { customer: { name: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: {
      milestones: true,
      sales: { select: { name: true } },
      pi: { select: { piNo: true, customer: { select: { name: true } } } },
    },
    orderBy: [{ latestNoteOn: "desc" }, { batchNo: "asc" }],
  });

  const today = new Date();

  const mapped = rows.map((s): ShipmentRow => {
    const milestones = toMilestoneViews(s.milestones, today);
    const stalled = s.latestNoteOn ? daysBetween(today, s.latestNoteOn) : 0;
    return {
      id: s.id,
      batchNo: s.batchNo,
      batchLabel: s.batchLabel,
      country: s.country,
      term: s.term,
      mode: s.mode,
      fcl: s.fcl,
      containerNo: s.containerNo,
      carrier: s.carrier,
      pod: s.pod,
      releaseState: s.releaseState,
      salesName: s.sales?.name ?? "—",
      team: s.team,
      latestNote: s.latestNote,
      latestNoteOn: isoDate(s.latestNoteOn) || null,
      hasTodo: s.hasTodo,
      piNo: s.pi?.piNo ?? null,
      customerName: s.pi?.customer?.name ?? null,
      milestones,
      stalledDays: stalled > 7 ? stalled : 0,
      hasLate: milestones.some((m) => m.state === "late"),
    };
  });

  // 「仅进行中」= 还有节点没走完。已全部完成的批次属于历史，不该占着当前视图。
  return onlyActive ? mapped.filter((r) => r.milestones.some((m) => m.state !== "done")) : mapped;
}

export async function getShipmentDetail(id: string) {
  const s = await db.shipment.findUnique({
    where: { id },
    include: {
      milestones: true,
      sales: { select: { name: true } },
      pi: { select: { piNo: true, product: true, customer: { select: { name: true, country: true } } } },
      notes: {
        orderBy: { happenedOn: "desc" },
        take: 20,
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!s) return null;

  return {
    id: s.id,
    batchNo: s.batchNo,
    batchLabel: s.batchLabel,
    country: s.country,
    term: s.term,
    mode: s.mode,
    fcl: s.fcl,
    containerNo: s.containerNo,
    carrier: s.carrier,
    pod: s.pod,
    releaseState: s.releaseState,
    team: s.team,
    salesName: s.sales?.name ?? "—",
    piNo: s.pi?.piNo ?? null,
    product: s.pi?.product ?? null,
    customerName: s.pi?.customer?.name ?? null,
    latestNote: s.latestNote,
    milestones: toMilestoneViews(s.milestones, new Date()),
    notes: s.notes.map((n) => ({
      id: n.id,
      body: n.body,
      on: isoDate(n.happenedOn),
      author: n.author?.name ?? "系统",
    })),
  };
}

export type ShipmentDetail = NonNullable<Awaited<ReturnType<typeof getShipmentDetail>>>;

export async function shipmentStats(rows: ShipmentRow[]) {
  return {
    total: rows.length,
    active: rows.filter((r) => !r.stalledDays && !r.hasLate).length,
    trouble: rows.filter((r) => r.stalledDays || r.hasLate).length,
  };
}

/** 筛选下拉用的业务员清单 */
export async function listSalesNames() {
  const users = await db.user.findMany({
    where: { role: "sales", active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => u.name);
}

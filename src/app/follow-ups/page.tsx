import { Filters } from "@/components/follow-ups/filters";
import { FollowUpTable } from "@/components/follow-ups/table";
import { listShipments, listSalesNames, getShipmentDetail } from "@/server/shipments";

export const metadata = { title: "跟单表 · MT 通商" };

// 演示数据要跟着写操作实时变，不做静态化
export const dynamic = "force-dynamic";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const [rows, salesNames] = await Promise.all([
    listShipments({
      q: one("q"),
      releaseState: one("state"),
      sales: one("sales"),
      onlyActive: one("active") !== "0",
    }),
    listSalesNames(),
  ]);

  // 抽屉按需取详情，列表查询就不必带上动态流水
  async function loadDetail(id: string) {
    "use server";
    return getShipmentDetail(id);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>跟单表</h1>
          <p>出运跟踪台账 · 一行一个出运批次</p>
        </div>
        <div className="acts">
          <button className="btn" disabled title="M2 后续接入">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m7 10 5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
            导出 Excel
          </button>
          <button className="btn btn-primary" disabled title="M2 后续接入">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增批次
          </button>
        </div>
      </div>

      <Filters salesNames={salesNames} />
      <FollowUpTable rows={rows} loadDetail={loadDetail} />
    </>
  );
}

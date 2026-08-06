import { OrderFilters } from "@/components/orders/order-filters";
import { OrderTable } from "@/components/orders/order-table";
import { ExportButton } from "@/components/export-button";
import { listOrders, orderKpis, getOrderDetail } from "@/server/orders";
import { PROFIT_WARN_PCT } from "@/lib/order-rules";
import { formatMoney, formatInt } from "@/lib/format";

export const metadata = { title: "订单核算跟踪 · MT 通商" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const [rows, kpi] = await Promise.all([
    listOrders({
      q: one("q"),
      settleState: one("settle"),
      onlyRisk: one("risk") === "1",
      archived: one("archived") === "1",
    }),
    orderKpis(),
  ]);

  const sorted =
    one("sort") === "profit" ? [...rows].sort((a, b) => a.profitRate - b.profitRate) : rows;

  async function loadDetail(id: string) {
    "use server";
    return getOrderDetail(id);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>订单核算跟踪</h1>
          <p>每个 PI 一行 · 成本超支自动进入复核</p>
        </div>
        <div className="acts">
          <ExportButton href="/api/export/orders" label="导出 Excel" />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="k">订单总数</span>
          <span className="v num">{formatInt(kpi.total)}</span>
          <span className="f">在跟进</span>
        </div>
        <div className="kpi" data-tone="accent">
          <span className="k">未完结</span>
          <span className="v num">{formatInt(kpi.unsettled)}</span>
          <span className="f">
            占比 <span className="num">{kpi.total ? ((kpi.unsettled / kpi.total) * 100).toFixed(1) : "0.0"}%</span>
          </span>
        </div>
        <div className="kpi" data-tone="amber">
          <span className="k">利润率预警 &lt; {PROFIT_WARN_PCT}%</span>
          <span className="v num">{formatInt(kpi.warn)}</span>
          <span className="f">需财务复核</span>
        </div>
        <div className="kpi" data-tone="coral">
          <span className="k">利润率 &lt; 0</span>
          <span className="v num">{formatInt(kpi.loss)}</span>
          <span className="f">已自动进入复核队列</span>
        </div>
        <div className="kpi" data-tone="jade">
          <span className="k">在跟订单额 USD</span>
          <span className="v num">{formatMoney(kpi.totalUsd).replace(/\.00$/, "")}</span>
          <span className="f">RMB 单按自定汇率折算并入</span>
        </div>
      </div>

      <OrderFilters />
      <OrderTable rows={sorted} loadDetail={loadDetail} />
    </>
  );
}

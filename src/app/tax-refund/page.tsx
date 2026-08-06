import { TaxFilters } from "@/components/tax/tax-filters";
import { TaxTable } from "@/components/tax/tax-table";
import { ExportButton } from "@/components/export-button";
import {
  listTaxInvoices,
  taxKpis,
  listEntities,
  listBuyers,
  listDeclareMonths,
  suggestPisForInvoice,
} from "@/server/tax";
import { formatCny, formatInt } from "@/lib/format";

export const metadata = { title: "退税管理 · MT 通商" };
export const dynamic = "force-dynamic";

export default async function TaxRefundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const entity = one("entity");
  const month = one("month");

  const [rows, kpi, entities, buyers, months] = await Promise.all([
    listTaxInvoices({
      q: one("q"),
      entity,
      month,
      buyer: one("buyer"),
      onlyUnlinked: one("unlinked") === "1",
    }),
    taxKpis(entity, month),
    listEntities(),
    listBuyers(),
    listDeclareMonths(),
  ]);

  async function loadCandidates(invoiceId: string) {
    "use server";
    return suggestPisForInvoice(invoiceId);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>退税管理</h1>
          <p>出口退税发票明细台账</p>
        </div>
        <div className="acts">
          <ExportButton href="/api/export/tax-refund" label="导出 Excel" />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi" data-tone="jade">
          <span className="k">本年实退税 ¥ · {kpi.year}</span>
          <span className="v num">{formatCny(kpi.yearTax)}</span>
          <span className="f">{entity ? `公司段：${entity}` : "全部公司段"}</span>
        </div>
        <div className="kpi">
          <span className="k">本月申报 ¥ · {kpi.monthLabel}</span>
          <span className="v num">{formatCny(kpi.monthTax)}</span>
          <span className="f">{kpi.monthTax ? "已有申报数据" : "该月尚未开始申报"}</span>
        </div>
        <div className="kpi" data-tone="accent">
          <span className="k">发票行数</span>
          <span className="v num">{formatInt(kpi.lines)}</span>
          <span className="f">当前公司段口径</span>
        </div>
        <div className="kpi" data-tone={kpi.unlinked ? "coral" : "jade"}>
          <span className="k">未关联订单行数</span>
          <span className="v num">{formatInt(kpi.unlinked)}</span>
          <span className="f">{kpi.unlinked ? "影响退税进度，需尽快挂到 PI" : "全部已关联"}</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "-4px 0 14px" }}>
        KPI 随公司段联动重算：金额按公司段全量口径（申报月筛选只决定「本月申报」这张卡，
        年度卡跨月累计是本意），行数随公司段筛选。
      </p>

      <TaxFilters entities={entities} buyers={buyers} months={months} />
      <TaxTable rows={rows} loadCandidates={loadCandidates} />
    </>
  );
}

import { NextRequest } from "next/server";
import { listShipments } from "@/server/shipments";
import { listOrders } from "@/server/orders";
import { listTaxInvoices } from "@/server/tax";
import { toXlsxBuffer, attachmentHeaders, stamp, MONEY_FORMAT, DATE_FORMAT, type Column } from "@/server/export";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

/** 导出沿用页面的筛选条件，所见即所得 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  if (kind === "follow-ups") {
    const rows = await listShipments({
      q: sp.get("q") ?? undefined,
      releaseState: sp.get("state") ?? undefined,
      sales: sp.get("sales") ?? undefined,
      onlyActive: sp.get("active") !== "0",
    });
    const pick = (r: (typeof rows)[number], kindName: string) =>
      r.milestones.find((m) => m.kind === kindName)?.value ?? "";

    const columns: Column<(typeof rows)[number]>[] = [
      { title: "批次号", width: 18, cell: (r) => ({ value: r.batchNo }) },
      { title: "分批", width: 8, cell: (r) => ({ value: r.batchLabel ?? "" }) },
      { title: "国家", width: 12, cell: (r) => ({ value: r.country }) },
      { title: "贸易条款", width: 12, cell: (r) => ({ value: r.term }) },
      { title: "走货", width: 8, cell: (r) => ({ value: r.mode }) },
      { title: "整柜/拼柜", width: 10, cell: (r) => ({ value: r.fcl ? "整柜" : "拼柜" }) },
      { title: "业务员", width: 10, cell: (r) => ({ value: r.salesName }) },
      { title: "小组", width: 10, cell: (r) => ({ value: r.team ?? "" }) },
      { title: "放行状态", width: 10, cell: (r) => ({ value: r.releaseState }) },
      { title: "最新动态", width: 42, cell: (r) => ({ value: r.latestNote ?? "" }) },
      { title: "动态日期", width: 12, cell: (r) => ({ value: day(r.latestNoteOn), type: Date, format: DATE_FORMAT }) },
      { title: "柜号", width: 18, cell: (r) => ({ value: r.containerNo ?? "" }) },
      { title: "船司", width: 10, cell: (r) => ({ value: r.carrier ?? "" }) },
      { title: "目的港", width: 14, cell: (r) => ({ value: r.pod ?? "" }) },
      { title: "交期", width: 8, cell: (r) => ({ value: pick(r, "交期") }) },
      { title: "装柜", width: 8, cell: (r) => ({ value: pick(r, "装柜") }) },
      { title: "进仓", width: 8, cell: (r) => ({ value: pick(r, "进仓") }) },
      { title: "ATD", width: 8, cell: (r) => ({ value: pick(r, "ATD") }) },
      { title: "ETA", width: 8, cell: (r) => ({ value: pick(r, "ETA") }) },
      { title: "停滞天数", width: 10, cell: (r) => ({ value: r.stalledDays || null, type: Number }) },
      { title: "关联 PI", width: 16, cell: (r) => ({ value: r.piNo ?? "" }) },
    ];
    const buf = await toXlsxBuffer(rows, columns);
    return new Response(new Uint8Array(buf), { headers: attachmentHeaders(`跟单表-${stamp()}.xlsx`) });
  }

  if (kind === "orders") {
    const rows = await listOrders({
      q: sp.get("q") ?? undefined,
      settleState: sp.get("settle") ?? undefined,
      onlyRisk: sp.get("risk") === "1",
      archived: sp.get("archived") === "1",
    });
    const columns: Column<(typeof rows)[number]>[] = [
      { title: "PI 号", width: 16, cell: (r) => ({ value: r.piNo }) },
      { title: "签约", width: 10, cell: (r) => ({ value: r.signedOn }) },
      { title: "业务员", width: 10, cell: (r) => ({ value: r.salesName }) },
      { title: "客户", width: 20, cell: (r) => ({ value: r.customerName }) },
      { title: "目的国", width: 12, cell: (r) => ({ value: r.destination }) },
      { title: "产品", width: 32, cell: (r) => ({ value: r.product ?? "" }) },
      { title: "币种", width: 8, cell: (r) => ({ value: r.currency }) },
      { title: "订单额", width: 14, cell: (r) => ({ value: r.amount, type: Number, format: MONEY_FORMAT }) },
      { title: "采购成本 ¥", width: 14, cell: (r) => ({ value: r.purchaseCost, type: Number, format: MONEY_FORMAT }) },
      { title: "应收", width: 14, cell: (r) => ({ value: r.receivable, type: Number, format: MONEY_FORMAT }) },
      { title: "应付 ¥", width: 14, cell: (r) => ({ value: r.payable, type: Number, format: MONEY_FORMAT }) },
      { title: "利润率 %", width: 11, cell: (r) => ({ value: r.profitRate, type: Number, format: "0.00" }) },
      { title: "状态", width: 10, cell: (r) => ({ value: r.settleState }) },
      { title: "提醒", width: 14, cell: (r) => ({ value: r.flag ?? "" }) },
      { title: "开票主体", width: 12, cell: (r) => ({ value: r.sellerEntity ?? "" }) },
    ];
    const buf = await toXlsxBuffer(rows, columns);
    return new Response(new Uint8Array(buf), { headers: attachmentHeaders(`订单核算跟踪-${stamp()}.xlsx`) });
  }

  if (kind === "tax-refund") {
    const rows = await listTaxInvoices({
      q: sp.get("q") ?? undefined,
      entity: sp.get("entity") ?? undefined,
      month: sp.get("month") ?? undefined,
      buyer: sp.get("buyer") ?? undefined,
      onlyUnlinked: sp.get("unlinked") === "1",
    });
    const columns: Column<(typeof rows)[number]>[] = [
      { title: "申报月", width: 10, cell: (r) => ({ value: r.declareMonth }) },
      { title: "批次", width: 8, cell: (r) => ({ value: r.batch }) },
      { title: "采购员", width: 10, cell: (r) => ({ value: r.buyer }) },
      { title: "订单号", width: 16, cell: (r) => ({ value: r.piNo ?? "" }) },
      { title: "销售方", width: 32, cell: (r) => ({ value: r.sellerName }) },
      { title: "发票号", width: 14, cell: (r) => ({ value: r.invoiceNo }) },
      { title: "明细", width: 34, cell: (r) => ({ value: r.item }) },
      { title: "数量", width: 12, cell: (r) => ({ value: r.qty, type: Number, format: "#,##0" }) },
      { title: "含税 ¥", width: 14, cell: (r) => ({ value: r.gross, type: Number, format: MONEY_FORMAT }) },
      { title: "不含税 ¥", width: 14, cell: (r) => ({ value: r.net, type: Number, format: MONEY_FORMAT }) },
      { title: "税额 ¥", width: 14, cell: (r) => ({ value: r.tax, type: Number, format: MONEY_FORMAT }) },
      { title: "出口时间", width: 12, cell: (r) => ({ value: day(r.exportedOn), type: Date, format: DATE_FORMAT }) },
      { title: "报关单号", width: 20, cell: (r) => ({ value: r.customsNo ?? "" }) },
      { title: "报关 USD", width: 14, cell: (r) => ({ value: r.customsUsd, type: Number, format: MONEY_FORMAT }) },
      { title: "开票主体", width: 12, cell: (r) => ({ value: r.entity ?? "" }) },
    ];
    const buf = await toXlsxBuffer(rows, columns);
    return new Response(new Uint8Array(buf), { headers: attachmentHeaders(`退税管理-${stamp()}.xlsx`) });
  }

  return new Response(`未知的导出类型：${kind}`, { status: 404 });
}

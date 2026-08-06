import { db } from "@/lib/db";
import { centsToYuan, isoDate } from "@/lib/format";

export type TaxRow = {
  id: string;
  declareMonth: string;
  batch: string;
  buyer: string;
  piNo: string | null;
  piId: string | null;
  sellerName: string;
  invoiceNo: string;
  item: string;
  qty: number;
  gross: number;
  net: number;
  tax: number;
  exportedOn: string | null;
  customsNo: string | null;
  customsUsd: number;
  entity: string | null;
};

export type TaxFilters = {
  q?: string;
  entity?: string;
  month?: string;
  buyer?: string;
  onlyUnlinked?: boolean;
};

export async function listTaxInvoices(filters: TaxFilters = {}): Promise<TaxRow[]> {
  const { q, entity, month, buyer, onlyUnlinked } = filters;

  const rows = await db.taxInvoice.findMany({
    where: {
      ...(entity ? { sellerEntity: { name: entity } } : {}),
      ...(month ? { declareMonth: month } : {}),
      ...(buyer ? { buyer } : {}),
      ...(onlyUnlinked ? { piId: null } : {}),
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q } },
              { customsNo: { contains: q } },
              { sellerName: { contains: q } },
              { item: { contains: q } },
              { pi: { piNo: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      pi: { select: { id: true, piNo: true } },
      sellerEntity: { select: { name: true } },
    },
    orderBy: [{ declareMonth: "desc" }, { invoiceNo: "asc" }],
  });

  return rows.map((t) => ({
    id: t.id,
    declareMonth: t.declareMonth,
    batch: t.batch,
    buyer: t.buyer,
    piNo: t.pi?.piNo ?? null,
    piId: t.pi?.id ?? null,
    sellerName: t.sellerName,
    invoiceNo: t.invoiceNo,
    item: t.item,
    qty: t.qty,
    gross: centsToYuan(t.grossCents),
    net: centsToYuan(t.netCents),
    tax: centsToYuan(t.taxCents),
    exportedOn: isoDate(t.exportedOn) || null,
    customsNo: t.customsNo,
    customsUsd: centsToYuan(t.customsUsdCents),
    entity: t.sellerEntity?.name ?? null,
  }));
}

/**
 * KPI 随公司段联动，但金额走「该公司段全量」口径而不是当前筛选：
 * 申报月筛选只决定「本月申报」这张卡，年度卡本来就该跨月累计。
 */
export async function taxKpis(entity?: string, month?: string) {
  const where = entity ? { sellerEntity: { name: entity } } : {};
  const year = new Date().getFullYear();

  const [all, monthly] = await Promise.all([
    db.taxInvoice.findMany({ where, select: { taxCents: true, declareMonth: true, piId: true } }),
    db.taxInvoice.findMany({
      where: { ...where, declareMonth: month || `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}` },
      select: { taxCents: true },
    }),
  ]);

  const yearRows = all.filter((t) => t.declareMonth.startsWith(String(year)));

  return {
    year,
    yearTax: yearRows.reduce((s, t) => s + centsToYuan(t.taxCents), 0),
    monthLabel: month || `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    monthTax: monthly.reduce((s, t) => s + centsToYuan(t.taxCents), 0),
    lines: all.length,
    unlinked: all.filter((t) => !t.piId).length,
  };
}

export async function listEntities() {
  const rows = await db.sellerEntity.findMany({
    where: { active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => r.name);
}

export async function listBuyers() {
  const rows = await db.taxInvoice.findMany({ select: { buyer: true }, distinct: ["buyer"], orderBy: { buyer: "asc" } });
  return rows.map((r) => r.buyer);
}

export async function listDeclareMonths() {
  const rows = await db.taxInvoice.findMany({
    select: { declareMonth: true },
    distinct: ["declareMonth"],
    orderBy: { declareMonth: "desc" },
  });
  return rows.map((r) => r.declareMonth);
}

/** 关联向导：按发票号 / 报关单号 / 销售方推荐候选 PI */
export async function suggestPisForInvoice(invoiceId: string) {
  const inv = await db.taxInvoice.findUnique({
    where: { id: invoiceId },
    select: { sellerName: true, exportedOn: true, declareMonth: true },
  });
  if (!inv) return [];

  const candidates = await db.pi.findMany({
    where: { status: { not: "archived" } },
    select: {
      id: true,
      piNo: true,
      product: true,
      signedOn: true,
      customer: { select: { name: true } },
    },
    orderBy: { signedOn: "desc" },
    take: 40,
  });

  return candidates.map((p) => ({
    id: p.id,
    piNo: p.piNo,
    product: p.product,
    customerName: p.customer.name,
    signedOn: isoDate(p.signedOn),
  }));
}

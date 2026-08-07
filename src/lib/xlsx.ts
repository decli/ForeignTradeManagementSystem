/**
 * Excel 导出。
 *
 * 导的是真正的 .xlsx，不是改了后缀的 CSV —— 金额写成数字并带 Excel 原生格式，
 * 财务拿到直接能求和、能透视。原来这件事在服务端做，现在整个搬到浏览器里，
 * 同一个 `write-excel-file` 包，浏览器构建产物本来就有。
 */

import type { Cell, Row, SheetData } from "write-excel-file/browser";

type CellType = "text" | "number" | "date";

export type SheetColumn<T> = {
  header: string;
  width?: number;
  type?: CellType;
  /** Excel 数字格式，如 "#,##0.00"、"0.00%" */
  format?: string;
  value: (row: T) => string | number | null | undefined;
};

export async function exportXlsx<T>(filename: string, columns: SheetColumn<T>[], rows: T[]) {
  // 走 /browser 子入口：node 入口会把 fs 之类的东西拖进包里
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const head: Row = columns.map((c) => ({
    value: c.header,
    fontWeight: "bold" as const,
    backgroundColor: "#EEF2F8",
    borderColor: "#C9D3E2",
    align: "left" as const,
  }));

  const body: SheetData = rows.map((r) =>
    columns.map((c): Cell => {
      const raw = c.value(r);
      // 空格子写 null，Excel 里就是真的空，不是字符串 "null"
      if (raw === null || raw === undefined || raw === "") return null;
      if (c.type === "number") {
        const n = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(n) ? { value: n, type: Number, format: c.format ?? "#,##0.00" } : null;
      }
      if (c.type === "date") {
        const d = new Date(String(raw));
        return Number.isNaN(d.getTime())
          ? { value: String(raw), type: String }
          : { value: d, type: Date, format: c.format ?? "yyyy-mm-dd" };
      }
      return { value: String(raw), type: String };
    }),
  );

  // v4 返回 { toBlob, toFile }，由调用方决定是下载还是拿 Blob
  await writeXlsxFile([head, ...body], {
    columns: columns.map((c) => ({ width: c.width ?? 16 })),
    stickyRowsCount: 1,
  }).toFile(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** 导出文件名带上日期，下载文件夹里不会堆出十个同名文件 */
export const stampName = (base: string) => `${base}_${new Date().toISOString().slice(0, 10)}`;

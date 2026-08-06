import writeExcelFile from "write-excel-file/node";

/** 表头统一加粗，正文左对齐；金额与日期用 Excel 原生格式，导出后还能继续算 */
const header = (text: string) => ({ value: text, fontWeight: "bold" as const });

export type Column<T> = {
  title: string;
  width?: number;
  cell: (row: T) => {
    value: string | number | Date | boolean | null;
    type?: typeof String | typeof Number | typeof Date | typeof Boolean;
    format?: string;
  };
};

export const MONEY_FORMAT = "#,##0.00";
export const DATE_FORMAT = "yyyy-mm-dd";

/**
 * 导出 .xlsx。金额写成真正的数字（不是带符号的字符串），
 * 这样财务拿到文件可以直接求和，不用先清洗。
 */
export async function toXlsxBuffer<T>(rows: T[], columns: Column<T>[]) {
  const spec = columns.map((c) => ({
    header: header(c.title),
    width: c.width ?? 16,
    cell: (row: T) => {
      const out = c.cell(row);
      // 空值必须给 undefined，写成 null 会让 write-excel-file 拒收
      return out.value === null || out.value === "" ? { value: undefined } : out;
    },
  }));
  // 库的 Cell 类型不接受可空 value，上面已经归一化过了
  return writeExcelFile(rows, { columns: spec as never }).toBuffer();
}

/** 中文文件名要按 RFC 5987 编码，否则部分浏览器会存成乱码 */
export function attachmentHeaders(filename: string) {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  };
}

export const stamp = () => new Date().toISOString().slice(0, 10);

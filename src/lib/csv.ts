/**
 * 表格解析：CSV 和「从 Excel 直接粘贴」。
 *
 * ── 为什么不做 .xlsx 上传 ──
 * 读 xlsx 要解 zip + 解析 SharedStrings + 处理样式，是一个几十 KB 的依赖，
 * 而这个项目零 UI/工具依赖。更要紧的是：**粘贴比传文件快**。
 * 财务把 Excel 里那一片选中、Ctrl+C、往框里一贴就完事，
 * 不用先另存为、再找文件、再上传。所以粘贴是主路径，选 .csv 文件是备用。
 *
 * 从 Excel 复制出来的剪贴板内容是**制表符分隔**的，不是逗号 ——
 * 分隔符要自动判，判错了整张表会挤成一列。
 */

export type Table = { headers: string[]; rows: string[][] };

/** 分隔符自动判定：看第一行里哪个字符更多。Excel 粘贴是 \t，导出的 CSV 是 , */
function sniff(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  // 德语区 Excel 导出的是分号分隔，这在外贸客户里不算罕见
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/**
 * 解析。手写状态机而不是 split —— 带引号的字段里可以有分隔符和换行，
 * `"Shanghai, China"` 用 split 会被劈成两列，而地址列里这种写法非常常见。
 */
export function parseTable(text: string): Table {
  const src = text.replace(/^﻿/, "").trimEnd();
  if (!src) return { headers: [], rows: [] };
  const sep = sniff(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        // 连续两个引号是一个转义的引号，不是结束
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  // 整行都是空的（Excel 选区末尾常带几行空的）直接丢掉
  return { headers, rows: rows.filter((r) => r.some((c) => c.trim() !== "")) };
}

/**
 * 按表头猜字段映射。
 *
 * 中英文都认，也认常见的别名（"公司名"/"客户名称"/"Company"）。
 * 猜错了用户能在界面上改 —— 但猜对八成能省掉八成的点击，
 * 而"要手工映射十二个字段"正是导入功能最劝退的一步。
 */
export function guessMapping(headers: string[], fields: Array<{ key: string; label: string; aliases: string[] }>) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-（）()：:*]/g, "");
  const used = new Set<string>();
  const map: Record<string, number> = {};
  for (const f of fields) {
    const keys = [f.key, f.label, ...f.aliases].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(String(i)) && keys.some((k) => norm(h) === k));
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(String(idx));
    }
  }
  // 第二轮放宽成"包含"，只补前面没猜到的
  for (const f of fields) {
    if (map[f.key] !== undefined) continue;
    const keys = [f.key, f.label, ...f.aliases].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(String(i)) && keys.some((k) => k.length > 1 && norm(h).includes(k)));
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(String(idx));
    }
  }
  return map;
}

/** 数字列：去掉千分位、货币符号、百分号后再转 */
export function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.replace(/[,\s¥$€£%]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 日期列：认 2026-08-08 / 2026/8/8 / 08/08/2026 三种最常见的写法 */
export function toDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // 日/月/年 与 月/日/年 分不清，只在日 > 12 时才敢判定，否则退回让用户自己改
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    if (a > 12) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

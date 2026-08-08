/**
 * 卡片里那些小表格的「导出」。
 *
 * 台账走 DataGrid，导出是它自带的（列定义在手，金额能写成真正的数字格）。
 * 但资金汇总、账户与科目、提成试算这几处是直接写在卡片里的 `<table>` ——
 * 三到九行，为它们各写一份列定义不划算，而人照样会想把提成表发给会计。
 *
 * 所以这里**从渲染好的 DOM 里读**。表格全部渲染出来了（没有分页），
 * 读到的就是屏幕上那张表，一行不多一行不少。
 *
 * 数字识别故意保守：带货币符号、带千分位、以 % 结尾，或者干脆是个整数，才转成数字。
 * **带小数点的裸数字一律留成文本** —— 这个产品里「3.24」是三月二十四号，
 * 不是三点二四。猜错一个数比不猜更糟。
 */

import { useRef, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { toast, toastError } from "@/components/ui/Toast";
import { exportXlsx, stampName } from "@/lib/xlsx";
import { useT } from "@/i18n";

const NUMERIC = [
  /^[¥$€£₩]\s*-?[\d,]+(\.\d+)?%?$/, // 带货币符号
  /^-?\d{1,3}(,\d{3})+(\.\d+)?%?$/, // 带千分位
  /^-?\d+(\.\d+)?%$/, // 百分比
  /^-?\d+$/, // 裸整数（裸小数不算，那多半是 3.24 这种日期）
];

function cellValue(text: string): string | number {
  const s = text.replace(/\s+/g, " ").trim();
  if (!NUMERIC.some((re) => re.test(s))) return s;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return s;
  // 百分比在 Excel 里存成小数，格式再乘回去，这样才能参与运算
  return s.endsWith("%") ? n / 100 : n;
}

/** 单元格的可读文本。图标、国旗、头像字母都挂 aria-hidden，读的时候摘掉 */
function cellText(td: HTMLElement) {
  const clone = td.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('svg,[aria-hidden="true"]').forEach((n) => n.remove());
  return clone.innerText ?? clone.textContent ?? "";
}

/**
 * 包住一张卡片内的 `<table>`，在卡片头上给一个导出按钮。
 *
 * 用法：`<Panel actions={tools.button}>{tools.wrap(<table …/>)}</Panel>`
 * —— 按钮和表格分处两个位置，所以返回一对而不是一个组件。
 */
export function useTableExport(name: string) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();

  const run = async () => {
    const table = ref.current?.querySelector("table");
    if (!table) return;
    const heads = [...table.querySelectorAll("thead th")].map((th) => (th as HTMLElement).innerText.replace(/\s+/g, " ").trim());
    const body = [...table.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td,th")].map((td) => cellValue(cellText(td as HTMLElement))),
    );
    if (!body.length) return;
    try {
      await exportXlsx(
        stampName(name),
        heads.map((h, i) => ({
          header: h || `#${i + 1}`,
          width: Math.max(10, Math.min(40, h.length * 2 + 8)),
          type: (body.some((r) => typeof r[i] === "number") ? "number" : "text") as "number" | "text",
          value: (r: (string | number)[]) => r[i] ?? "",
        })),
        body,
      );
      toast(t("已导出 {n} 行", { n: body.length }));
    } catch {
      toastError(t("导出失败，换个浏览器或稍后再试"));
    }
  };

  return {
    button: (
      <button className="btn btn-sm" onClick={run} data-tip={t("导出这张表")}>
        <Icon name="download" />
        {t("导出")}
      </button>
    ),
    wrap: (children: ReactNode) => <div ref={ref}>{children}</div>,
  };
}

/**
 * 产品目录。
 *
 * 从 ops-seed 里搬出来单独放，是因为现在有**两个**地方要用它：
 * 采购模块的产品主档，和 PI / 报价单的明细行。而明细行必须在 PI 之前生成
 * （PI 金额是明细行的合计），所以它不能再藏在采购那一段种子里。
 *
 * HS 编码与退税率照真实税则填 —— 退税模块的税额要推得平。
 * `sellE4` 是标准对外报价（美元，4 位小数），报价核算器以它为起点，
 * 低于它的报价会触发「特价审批」。这批价格对应的净利率在 10%~20% 之间 ——
 * 外贸贸易商的真实区间就是这个量级，报出 30% 的演示数据没人信。
 */

import type { Product } from "./ops-types";

const yuan = (n: number) => Math.round(n * 100);

export type CatalogItem = Omit<Product, "id"> & {
  /** 标准对外报价 × 10000，美元 */
  sellE4: number;
};

export const PRODUCT_SEED: CatalogItem[] = [
  { sku: "PPE-COV-L", name: "一次性防护服（L 码）", nameEn: "Disposable coverall (L)", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(11.8), sellE4: 19_740, packQty: 50, grossWeightG: 9500, volumeCm3: 62_000, active: true, note: "SMS 无纺布 60g，欧标 Type 5/6。" },
  { sku: "PPE-COV-XL", name: "一次性防护服（XL 码）", nameEn: "Disposable coverall (XL)", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(12.4), sellE4: 20_832, packQty: 50, grossWeightG: 10_200, volumeCm3: 66_000, active: true, note: null },
  { sku: "PPE-ISO-BLU", name: "一次性隔离衣 · 蓝色", nameEn: "Isolation gown, blue", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(4.6), sellE4: 7980, packQty: 100, grossWeightG: 8200, volumeCm3: 54_000, active: true, note: null },
  { sku: "MSK-SUR-3P", name: "医用外科口罩（三层）", nameEn: "Surgical mask, 3-ply", category: "口罩", hsCode: "6307900000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.32), sellE4: 571, packQty: 2000, grossWeightG: 7600, volumeCm3: 48_000, active: true, note: "每 50 只一盒，40 盒一箱。" },
  { sku: "MSK-N95", name: "N95 防护口罩", nameEn: "N95 respirator", category: "口罩", hsCode: "6307900000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(1.45), sellE4: 2478, packQty: 800, grossWeightG: 6400, volumeCm3: 72_000, active: true, note: "NIOSH 认证，美国线专用。" },
  { sku: "GLV-NIT-M", name: "丁腈检查手套（M 码）", nameEn: "Nitrile exam glove (M)", category: "手套", hsCode: "4015190000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.28), sellE4: 496, packQty: 1000, grossWeightG: 11_200, volumeCm3: 41_000, active: true, note: "原料随石油价波动，报价有效期只给 7 天。" },
  { sku: "PPE-FSH", name: "防护面屏", nameEn: "Face shield", category: "防护用品", hsCode: "3926909090", refundRateBp: 1300, unit: "件", lastCostCents: yuan(2.1), sellE4: 3612, packQty: 200, grossWeightG: 9800, volumeCm3: 88_000, active: true, note: null },
  { sku: "PPE-CAP", name: "一次性帽子", nameEn: "Disposable cap", category: "防护用品", hsCode: "6505009900", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.06), sellE4: 113, packQty: 5000, grossWeightG: 5200, volumeCm3: 52_000, active: true, note: null },
  { sku: "PPE-SHC", name: "医用鞋套", nameEn: "Shoe cover", category: "防护用品", hsCode: "6307900000", refundRateBp: 1300, unit: "双", lastCostCents: yuan(0.09), sellE4: 164, packQty: 4000, grossWeightG: 6100, volumeCm3: 46_000, active: true, note: null },
  { sku: "PPE-SRG", name: "一次性手术衣", nameEn: "Surgical gown", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(6.8), sellE4: 11_592, packQty: 60, grossWeightG: 9100, volumeCm3: 58_000, active: true, note: "带袖口弹性，需 EO 灭菌。" },
  { sku: "CCTV-BUL", name: "枪型网络摄像机", nameEn: "Bullet IP camera", category: "安防电子", hsCode: "8525801390", refundRateBp: 1300, unit: "台", lastCostCents: yuan(96), sellE4: 164_640, packQty: 20, grossWeightG: 14_500, volumeCm3: 76_000, active: true, note: "含 POE 供电，出口需带电池说明。" },
  { sku: "CCTV-DOM", name: "半球形网络摄像机", nameEn: "Dome IP camera", category: "安防电子", hsCode: "8525801390", refundRateBp: 1300, unit: "台", lastCostCents: yuan(88), sellE4: 152_880, packQty: 24, grossWeightG: 13_200, volumeCm3: 71_000, active: true, note: null },
  { sku: "CCTV-NVR", name: "网络硬盘录像机", nameEn: "Network video recorder", category: "安防电子", hsCode: "8521901000", refundRateBp: 1300, unit: "台", lastCostCents: yuan(320), sellE4: 533_400, packQty: 8, grossWeightG: 18_600, volumeCm3: 94_000, active: true, note: "含硬盘的型号走空运要报危包。" },
  { sku: "MED-THM", name: "红外测温枪", nameEn: "Infrared thermometer", category: "医疗器械", hsCode: "9025199090", refundRateBp: 1300, unit: "支", lastCostCents: yuan(23.5), sellE4: 40_740, packQty: 100, grossWeightG: 12_400, volumeCm3: 68_000, active: true, note: "含纽扣电池，海运需申报。" },
  { sku: "MED-SWB", name: "医用棉签", nameEn: "Medical swab", category: "医疗器械", hsCode: "3005901000", refundRateBp: 1300, unit: "支", lastCostCents: yuan(0.04), sellE4: 77, packQty: 10_000, grossWeightG: 8400, volumeCm3: 44_000, active: true, note: null },
];

/** 产品主档。id 由调用方给，两边（主种子和采购种子）用的必须是同一批对象 */
export function buildProducts(mkId: (p: string) => string): Product[] {
  return PRODUCT_SEED.map(({ sellE4: _drop, ...p }) => ({ ...p, id: mkId("prd") }));
}

export const sellOf = (sku: string) => PRODUCT_SEED.find((p) => p.sku === sku)?.sellE4 ?? 0;

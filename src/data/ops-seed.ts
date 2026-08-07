/**
 * 采购协同与资金侧的演示数据。
 *
 * 跟主种子一样：手写的那批供应商和产品是照真实外贸场景写的（HS 编码、退税率、
 * 账期、资质到期都对得上），询价 / 合同 / 生产单 / 收付款在它们之上生成，
 * 并且**挂回已有的 PI** —— 不挂的话这些模块就是几张互不相干的空表，
 * 演示不出「一条 PI 号串起全流程」这件事。
 */

import type { Database } from "./types";
import type {
  BankAccount,
  OpsData,
  Payment,
  ProductionOrder,
  Product,
  PurchaseContract,
  Rfq,
  RfqQuote,
  Supplier,
} from "./ops-types";

const DAY = 86_400_000;
const yuan = (n: number) => Math.round(n * 100);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildOpsSeed(db: Database): OpsData {
  const rand = mulberry32(19260817);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (offsetDays: number) => new Date(today + offsetDays * DAY).toISOString().slice(0, 10);
  let n = 0;
  const id = (p: string) => `${p}_${(++n).toString(36).padStart(4, "0")}`;

  // ───────────── 供应商 ─────────────
  // 名字取自主种子里退税发票的销售方，两边对得上才叫一套数据
  const supplierSeed: Array<Omit<Supplier, "id" | "createdAt">> = [
    { code: "S-001", name: "厦门安洁无纺制品有限公司", nameEn: "Xiamen Anjie Nonwoven", category: "防护用品", contact: "王建国", phone: "0592-6688xxx", province: "福建", termDays: 30, score: 92, certExpiry: iso(210), taxNo: "91350200MA2AAAA1X", bank: "中国银行厦门分行", active: true, note: "配合度最好的一家，急单能插队。" },
    { code: "S-002", name: "江苏正阳防护用品有限公司", nameEn: "Jiangsu Zhengyang Protective", category: "防护用品", contact: "李海涛", phone: "0512-8899xxx", province: "江苏", termDays: 45, score: 85, certExpiry: iso(58), taxNo: "91320500MA1BBBB2Y", bank: "招商银行苏州分行", active: true, note: "资质两个月内到期，需提前提醒换证。" },
    { code: "S-003", name: "浙江宏达医疗器械有限公司", nameEn: "Zhejiang Hongda Medical", category: "医疗器械", contact: "陈立", phone: "0574-8877xxx", province: "浙江", termDays: 30, score: 88, certExpiry: iso(430), taxNo: "91330200MA2CCCC3Z", bank: "宁波银行", active: true, note: "CE / FDA 齐全，欧美单优先给他们。" },
    { code: "S-004", name: "湖北康泰无纺布制品有限公司", nameEn: "Hubei Kangtai Nonwoven", category: "防护用品", contact: "刘芳", phone: "027-8866xxx", province: "湖北", termDays: 60, score: 74, certExpiry: iso(150), taxNo: "91420100MA4DDDD4A", bank: "建设银行武汉分行", active: true, note: "价格便宜但交期常拖，大单不敢单给一家。" },
    { code: "S-005", name: "湖北真诚无纺布制品有限公司", nameEn: "Hubei Zhencheng Nonwoven", category: "防护用品", contact: "赵敏", phone: "027-8855xxx", province: "湖北", termDays: 45, score: 79, certExpiry: iso(-12), taxNo: "91420100MA4EEEE5B", bank: "农业银行武汉分行", active: true, note: "资质已过期，暂停下单直到换证。" },
    { code: "S-006", name: "泉州黑鹰威视电子科技有限公司", nameEn: "Quanzhou Heiying Vision", category: "安防电子", contact: "林志强", phone: "0595-2233xxx", province: "福建", termDays: 30, score: 90, certExpiry: iso(320), taxNo: "91350500MA3FFFF6C", bank: "兴业银行泉州分行", active: true, note: "监控类唯一供应商，议价空间小。" },
    { code: "S-007", name: "广东恒安医疗用品有限公司", nameEn: "Guangdong Heng'an Medical", category: "医疗器械", contact: "吴伟", phone: "020-3344xxx", province: "广东", termDays: 30, score: 83, certExpiry: iso(275), taxNo: "91440100MA5GGGG7D", bank: "工商银行广州分行", active: true, note: "手套类强项，价格随丁腈原料波动大。" },
    { code: "S-008", name: "山东华康防护科技有限公司", nameEn: "Shandong Huakang Protective", category: "防护用品", contact: "孙鹏", phone: "0531-5566xxx", province: "山东", termDays: 45, score: 81, certExpiry: iso(190), taxNo: "91370100MA6HHHH8E", bank: "浦发银行济南分行", active: true, note: "北方仓，走青岛港比走厦门省两天。" },
  ];
  const suppliers: Supplier[] = supplierSeed.map((s) => ({ ...s, id: id("sup"), createdAt: now.toISOString() }));

  // ───────────── 产品 ─────────────
  // HS 编码与退税率照真实税则填，退税模块的税额才推得平
  const productSeed: Array<Omit<Product, "id">> = [
    { sku: "PPE-COV-L", name: "一次性防护服（L 码）", nameEn: "Disposable coverall (L)", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(11.8), packQty: 50, grossWeightG: 9500, volumeCm3: 62000, active: true, note: "SMS 无纺布 60g，欧标 Type 5/6。" },
    { sku: "PPE-COV-XL", name: "一次性防护服（XL 码）", nameEn: "Disposable coverall (XL)", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(12.4), packQty: 50, grossWeightG: 10200, volumeCm3: 66000, active: true, note: null },
    { sku: "PPE-ISO-BLU", name: "一次性隔离衣 · 蓝色", nameEn: "Isolation gown, blue", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(4.6), packQty: 100, grossWeightG: 8200, volumeCm3: 54000, active: true, note: null },
    { sku: "MSK-SUR-3P", name: "医用外科口罩（三层）", nameEn: "Surgical mask, 3-ply", category: "口罩", hsCode: "6307900000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.32), packQty: 2000, grossWeightG: 7600, volumeCm3: 48000, active: true, note: "每 50 只一盒，40 盒一箱。" },
    { sku: "MSK-N95", name: "N95 防护口罩", nameEn: "N95 respirator", category: "口罩", hsCode: "6307900000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(1.45), packQty: 800, grossWeightG: 6400, volumeCm3: 72000, active: true, note: "NIOSH 认证，美国线专用。" },
    { sku: "GLV-NIT-M", name: "丁腈检查手套（M 码）", nameEn: "Nitrile exam glove (M)", category: "手套", hsCode: "4015190000", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.28), packQty: 1000, grossWeightG: 11200, volumeCm3: 41000, active: true, note: "原料随石油价波动，报价有效期只给 7 天。" },
    { sku: "PPE-FSH", name: "防护面屏", nameEn: "Face shield", category: "防护用品", hsCode: "3926909090", refundRateBp: 1300, unit: "件", lastCostCents: yuan(2.1), packQty: 200, grossWeightG: 9800, volumeCm3: 88000, active: true, note: null },
    { sku: "PPE-CAP", name: "一次性帽子", nameEn: "Disposable cap", category: "防护用品", hsCode: "6505009900", refundRateBp: 1300, unit: "只", lastCostCents: yuan(0.06), packQty: 5000, grossWeightG: 5200, volumeCm3: 52000, active: true, note: null },
    { sku: "PPE-SHC", name: "医用鞋套", nameEn: "Shoe cover", category: "防护用品", hsCode: "6307900000", refundRateBp: 1300, unit: "双", lastCostCents: yuan(0.09), packQty: 4000, grossWeightG: 6100, volumeCm3: 46000, active: true, note: null },
    { sku: "PPE-SRG", name: "一次性手术衣", nameEn: "Surgical gown", category: "防护服", hsCode: "6210103000", refundRateBp: 1300, unit: "件", lastCostCents: yuan(6.8), packQty: 60, grossWeightG: 9100, volumeCm3: 58000, active: true, note: "带袖口弹性，需 EO 灭菌。" },
    { sku: "CCTV-BUL", name: "枪型网络摄像机", nameEn: "Bullet IP camera", category: "安防电子", hsCode: "8525801390", refundRateBp: 1300, unit: "台", lastCostCents: yuan(96), packQty: 20, grossWeightG: 14500, volumeCm3: 76000, active: true, note: "含 POE 供电，出口需带电池说明。" },
    { sku: "CCTV-DOM", name: "半球形网络摄像机", nameEn: "Dome IP camera", category: "安防电子", hsCode: "8525801390", refundRateBp: 1300, unit: "台", lastCostCents: yuan(88), packQty: 24, grossWeightG: 13200, volumeCm3: 71000, active: true, note: null },
    { sku: "CCTV-NVR", name: "网络硬盘录像机", nameEn: "Network video recorder", category: "安防电子", hsCode: "8521901000", refundRateBp: 1300, unit: "台", lastCostCents: yuan(320), packQty: 8, grossWeightG: 18600, volumeCm3: 94000, active: true, note: "含硬盘的型号走空运要报危包。" },
    { sku: "MED-THM", name: "红外测温枪", nameEn: "Infrared thermometer", category: "医疗器械", hsCode: "9025199090", refundRateBp: 1300, unit: "支", lastCostCents: yuan(23.5), packQty: 100, grossWeightG: 12400, volumeCm3: 68000, active: true, note: "含纽扣电池，海运需申报。" },
    { sku: "MED-SWB", name: "医用棉签", nameEn: "Medical swab", category: "医疗器械", hsCode: "3005901000", refundRateBp: 1300, unit: "支", lastCostCents: yuan(0.04), packQty: 10000, grossWeightG: 8400, volumeCm3: 44000, active: true, note: null },
  ];
  const products: Product[] = productSeed.map((p) => ({ ...p, id: id("prd") }));

  // ───────────── 银行账户 ─────────────
  const accounts: BankAccount[] = [
    { id: id("acc"), name: "美元结算户", bank: "中国银行厦门分行", accountNo: "4001****8821", currency: "USD", openingCents: 128_400_00, active: true },
    { id: id("acc"), name: "人民币基本户", bank: "中国银行厦门分行", accountNo: "4001****8809", currency: "CNY", openingCents: 3_820_000_00, active: true },
    { id: id("acc"), name: "供应链美元户", bank: "招商银行厦门分行", accountNo: "5919****3302", currency: "USD", openingCents: 46_200_00, active: true },
  ];

  const openPis = db.pis.filter((p) => p.status !== "archived");
  const purchasers = db.users.filter((u) => u.role === "purchaser");

  // ───────────── 询价单 + 报价 ─────────────
  const rfqs: Rfq[] = [];
  const rfqQuotes: RfqQuote[] = [];
  for (let i = 0; i < 14; i++) {
    const product = pick(products);
    const rfqId = id("rfq");
    const createdOff = -Math.floor(between(2, 90));
    // 一次询 3–5 家，比价才有意义
    const bidders = [...suppliers].sort(() => rand() - 0.5).slice(0, 3 + Math.floor(rand() * 3));
    const quotes = bidders.map((sup) => {
      const q: RfqQuote = {
        id: id("qot"),
        rfqId,
        supplierId: sup.id,
        // 以产品最近成本为基准上下浮动，低分供应商报得更低（便宜有便宜的道理）
        unitPriceCents: Math.round(product.lastCostCents * between(0.88, 1.18) * (sup.score > 85 ? 1.04 : 0.97)),
        leadDays: Math.round(between(12, 40)),
        validUntil: iso(createdOff + Math.round(between(7, 30))),
        moq: [1000, 2000, 5000, 10_000][Math.floor(rand() * 4)],
        note: null,
      };
      return q;
    });
    rfqQuotes.push(...quotes);
    const decided = rand() < 0.55;
    // 定标不一定挑最低价 —— 交期和评分也算进去，这才是真实的采购决策
    const best = [...quotes].sort((a, b) => a.unitPriceCents - b.unitPriceCents)[0];
    rfqs.push({
      id: rfqId,
      rfqNo: `RFQ${String(now.getFullYear()).slice(2)}${String(1000 + i)}`,
      productId: product.id,
      qty: Math.round(between(5_000, 300_000) / 1000) * 1000,
      wantedBy: iso(createdOff + Math.round(between(30, 75))),
      status: decided ? "closed" : quotes.length ? "quoted" : "open",
      ownerId: pick(purchasers)?.id ?? null,
      awardedQuoteId: decided ? best.id : null,
      createdAt: iso(createdOff),
      note: null,
    });
  }

  // ───────────── 采购合同 ─────────────
  const contracts: PurchaseContract[] = [];
  const termOptions = ["30% 定金 + 70% 见提单", "款到发货", "货到付款 30 天", "50% 定金 + 50% 发货前"];
  openPis.slice(0, 34).forEach((pi, i) => {
    const product = products.find((p) => pi.product?.includes(p.name.slice(0, 4))) ?? pick(products);
    const supplier = pick(suppliers.filter((s) => s.category === product.category)) ?? pick(suppliers);
    const qty = Math.round(between(3_000, 200_000) / 100) * 100;
    const unit = Math.round(product.lastCostCents * between(0.95, 1.1));
    const amount = qty * unit;
    const signedOff = -Math.floor(between(5, 120));
    const status = signedOff < -80 ? "closed" : signedOff < -35 ? "executing" : rand() < 0.8 ? "signed" : "draft";
    // 已付比例跟合同阶段挂钩，才对得上「付款计划 vs 实际付款」
    const paidRatio = status === "closed" ? 1 : status === "executing" ? between(0.3, 0.8) : status === "signed" ? (rand() < 0.6 ? 0.3 : 0) : 0;
    contracts.push({
      id: id("pc"),
      contractNo: `PC${String(now.getFullYear()).slice(2)}${String(2000 + i)}`,
      supplierId: supplier.id,
      piId: pi.id,
      productId: product.id,
      qty,
      unitPriceCents: unit,
      amountCents: amount,
      signedOn: iso(signedOff),
      deliveryBy: iso(signedOff + Math.round(between(25, 60))),
      terms: pick(termOptions),
      status,
      paidCents: Math.round(amount * paidRatio),
      createdAt: iso(signedOff),
    });
  });

  // ───────────── 生产单 ─────────────
  const productions: ProductionOrder[] = contracts
    .filter((c) => c.status !== "draft")
    .map((c, i) => {
      const dueOff = Math.round((Date.parse(`${c.deliveryBy}T00:00:00Z`) - today) / DAY);
      const overdue = dueOff < 0;
      // 已过交期还没完工 = 延期，这类行在页面上要能一眼挑出来
      const roll = rand();
      const status = overdue
        ? roll < 0.78
          ? "done"
          : "delayed"
        : dueOff < 8
          ? roll < 0.45
            ? "inspecting"
            : "producing"
          : roll < 0.35
            ? "producing"
            : "pending";
      const done = status === "done" ? c.qty : status === "inspecting" ? c.qty : status === "producing" ? Math.round(c.qty * between(0.2, 0.85)) : 0;
      return {
        id: id("po"),
        orderNo: `PO${String(now.getFullYear()).slice(2)}${String(3000 + i)}`,
        contractId: c.id,
        supplierId: c.supplierId,
        productId: c.productId,
        piId: c.piId,
        qty: c.qty,
        doneQty: done,
        startOn: status === "pending" ? null : c.signedOn,
        dueOn: c.deliveryBy ?? iso(30),
        status,
        qcResult: status === "done" ? (rand() < 0.92 ? "pass" : "fail") : null,
        qcOn: status === "done" ? c.deliveryBy : null,
        note: status === "delayed" ? "工厂反馈原料到货延迟，已要求给书面交期" : null,
        createdAt: c.signedOn,
      };
    });

  // ───────────── 收付款 ─────────────
  const payments: Payment[] = [];
  const rate = 6.7;
  const customerById = new Map(db.customers.map((c) => [c.id, c]));
  // 收汇：按订单的应收拆成定金 + 尾款
  db.costings.forEach((c, i) => {
    if (c.receivableCents <= 0) return;
    const pi = db.pis.find((p) => p.id === c.piId);
    if (!pi) return;
    const cust = customerById.get(pi.customerId);
    const off = -Math.floor(between(1, 100));
    payments.push({
      id: id("pay"),
      paymentNo: `RC${String(now.getFullYear()).slice(2)}${String(4000 + i)}`,
      direction: "in",
      piId: pi.id,
      contractId: null,
      counterparty: cust?.name ?? "—",
      currency: pi.currency,
      amountCents: c.receivableCents,
      cnyCents: Math.round(c.receivableCents * rate),
      rateE6: Math.round(rate * 1e6),
      paidOn: iso(off),
      accountId: accounts[0].id,
      status: off < -20 ? "reconciled" : rand() < 0.7 ? "confirmed" : "pending",
      voucherNo: `SWIFT${Math.floor(between(100000, 999999))}`,
      note: null,
    });
  });
  // 付汇：按合同已付金额
  contracts.forEach((c, i) => {
    if (c.paidCents <= 0) return;
    const sup = suppliers.find((s) => s.id === c.supplierId);
    const off = Math.round((Date.parse(`${c.signedOn}T00:00:00Z`) - today) / DAY) + Math.floor(between(2, 20));
    payments.push({
      id: id("pay"),
      paymentNo: `PY${String(now.getFullYear()).slice(2)}${String(5000 + i)}`,
      direction: "out",
      piId: c.piId,
      contractId: c.id,
      counterparty: sup?.name ?? "—",
      currency: "CNY",
      amountCents: c.paidCents,
      cnyCents: c.paidCents,
      rateE6: 1_000_000,
      paidOn: iso(Math.min(off, -1)),
      accountId: accounts[1].id,
      status: rand() < 0.85 ? "reconciled" : "confirmed",
      voucherNo: `HD${Math.floor(between(100000, 999999))}`,
      note: null,
    });
  });
  payments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  return { suppliers, products, rfqs, rfqQuotes, contracts, productions, payments, accounts };
}

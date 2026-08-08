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
  DocRecord,
  FreightLane,
  FreightQuote,
  LoginLog,
  OpsData,
  Payment,
  ProductionOrder,
  Product,
  PurchaseContract,
  Rfq,
  RfqQuote,
  StockItem,
  Supplier,
} from "./ops-types";
import { DOC_KINDS, FORM_BY_COUNTRY, STOCK_WAREHOUSES } from "./ops-types";

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

/**
 * `products` 由主种子传进来 —— 产品目录现在有两个消费者（产品主档和 PI 明细行），
 * 而明细行必须先于 PI 生成（PI 金额是明细行的合计），所以它不能再在这里创建。
 */
export function buildOpsSeed(db: Database, products: Product[]): OpsData {
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
    { code: "S-001", name: "厦门安洁无纺制品有限公司", nameEn: "Xiamen Anjie Nonwoven", category: "防护用品", contact: "王建国", phone: "0592-6688xxx", province: "福建", termDays: 30, score: 92, certExpiry: iso(210), taxNo: "91350200MA2AAAA1XB", bank: "中国银行厦门分行", active: true, note: "配合度最好的一家，急单能插队。" },
    { code: "S-002", name: "江苏正阳防护用品有限公司", nameEn: "Jiangsu Zhengyang Protective", category: "防护用品", contact: "李海涛", phone: "0512-8899xxx", province: "江苏", termDays: 45, score: 85, certExpiry: iso(58), taxNo: "91320500MA1BBBB2YK", bank: "招商银行苏州分行", active: true, note: "资质两个月内到期，需提前提醒换证。" },
    { code: "S-003", name: "浙江宏达医疗器械有限公司", nameEn: "Zhejiang Hongda Medical", category: "医疗器械", contact: "陈立", phone: "0574-8877xxx", province: "浙江", termDays: 30, score: 88, certExpiry: iso(430), taxNo: "91330200MA2CCCC3ZP", bank: "宁波银行", active: true, note: "CE / FDA 齐全，欧美单优先给他们。" },
    { code: "S-004", name: "湖北康泰无纺布制品有限公司", nameEn: "Hubei Kangtai Nonwoven", category: "防护用品", contact: "刘芳", phone: "027-8866xxx", province: "湖北", termDays: 60, score: 74, certExpiry: iso(150), taxNo: "91420100MA4DDDD4AT", bank: "建设银行武汉分行", active: true, note: "价格便宜但交期常拖，大单不敢单给一家。" },
    { code: "S-005", name: "湖北真诚无纺布制品有限公司", nameEn: "Hubei Zhencheng Nonwoven", category: "防护用品", contact: "赵敏", phone: "027-8855xxx", province: "湖北", termDays: 45, score: 79, certExpiry: iso(-12), taxNo: null, bank: "农业银行武汉分行", active: true, note: "资质已过期，暂停下单直到换证。" },
    { code: "S-006", name: "泉州黑鹰威视电子科技有限公司", nameEn: "Quanzhou Heiying Vision", category: "安防电子", contact: "林志强", phone: "0595-2233xxx", province: "福建", termDays: 30, score: 90, certExpiry: iso(320), taxNo: "91350500MA3FFFF6CW", bank: "兴业银行泉州分行", active: true, note: "监控类唯一供应商，议价空间小。" },
    { code: "S-007", name: "广东恒安医疗用品有限公司", nameEn: "Guangdong Heng'an Medical", category: "医疗器械", contact: "吴伟", phone: "020-3344xxx", province: "广东", termDays: 30, score: 83, certExpiry: iso(275), taxNo: "91440100MA5GGGG7DR", bank: "工商银行广州分行", active: true, note: "手套类强项，价格随丁腈原料波动大。" },
    { code: "S-008", name: "山东华康防护科技有限公司", nameEn: "Shandong Huakang Protective", category: "防护用品", contact: "孙鹏", phone: "0531-5566xxx", province: "山东", termDays: 45, score: 81, certExpiry: iso(190), taxNo: "91370100MA6HHHH8E", bank: null, active: true, note: "北方仓，走青岛港比走厦门省两天。" },
  ];
  const suppliers: Supplier[] = supplierSeed.map((s) => ({ ...s, id: id("sup"), createdAt: now.toISOString() }));

  // ───────────── 银行账户 ─────────────
  const accounts: BankAccount[] = [
    { id: id("acc"), name: "美元结算户", bank: "中国银行厦门分行", accountNo: "4001****8821", currency: "USD", openingCents: 128_400_00, active: true },
    { id: id("acc"), name: "人民币基本户", bank: "中国银行厦门分行", accountNo: "4001****8809", currency: "CNY", openingCents: 9_260_000_00, active: true },
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
    /* 采购金额必须从它挂的那张 PI 推出来，不能自己随机。
       否则会出现「卖 5 万美金的单子，采购合同签了 700 万人民币」这种账 ——
       单看采购页看不出问题，一到资金汇总就是净流出 6 倍收汇，整个演示就假了。
       口径：采购成本占售价 62%~82%，剩下的是毛利和期间费用。 */
    const fx = pi.currency === "CNY" ? 1 : pi.currency === "EUR" ? 7.9 : 6.7;
    const unit = Math.round(product.lastCostCents * between(0.95, 1.1));
    const targetCny = Math.round(pi.amountCents * fx * between(0.62, 0.82));
    // 数量取整到百，再用数量反算金额，保证明细页上「单价 × 数量 = 合同额」对得上
    const qty = Math.max(500, Math.round(targetCny / unit / 100) * 100);
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
      accountId: i % 3 === 2 ? accounts[2].id : accounts[0].id,
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
  /* ── 挂不上单据的收汇 ──
     真实场景：客户付款时电汇附言只写了个抬头，或者一笔钱付了两张 PI 的尾款，
     财务收到银行回单但不知道该冲哪一单。这是收付款模块每个月最花时间的活，
     所以演示数据里必须有几笔 —— 不然「待认领」永远是 0，功能等于不存在。 */
  const strayNames = ["MEDLINE INDUSTRIES LP", "PT. SEJAHTERA MEDIKA", "Al Faris Trading LLC", "OOO MEDTEKHNIKA"];
  strayNames.forEach((name, i) => {
    payments.push({
      id: id("pay"),
      paymentNo: `RC${String(now.getFullYear()).slice(2)}${String(4900 + i)}`,
      direction: "in",
      piId: null,
      contractId: null,
      counterparty: name,
      currency: "USD",
      amountCents: Math.round(between(4_000_00, 38_000_00)),
      cnyCents: 0,
      rateE6: Math.round(rate * 1e6),
      paidOn: iso(-Math.floor(between(1, 26))),
      accountId: accounts[0].id,
      status: "pending",
      voucherNo: `SWIFT${Math.floor(between(100000, 999999))}`,
      note: "汇入附言无法对应到具体 PI，待业务确认",
    });
  });
  for (const p of payments) if (p.cnyCents === 0) p.cnyCents = Math.round(p.amountCents * rate);

  payments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  // ───────────── 库存 ─────────────
  // 一个产品一个仓一个批次一行。医疗器械和防护用品都有效期，
  // 所以批号和有效期是必填的 —— 出了问题要能召回到批。
  const stock: StockItem[] = [];
  products.forEach((prd, pi2) => {
    const lots = 1 + Math.floor(rand() * 2);
    for (let l = 0; l < lots; l++) {
      const inbound = -Math.floor(between(3, 220));
      const qty = Math.round(between(prd.packQty * 4, prd.packQty * 90) / prd.packQty) * prd.packQty;
      // 三成的库存被在跟的 PI 锁掉了，可用量要扣掉这部分
      const lock = rand() < 0.32 ? pick(openPis) : null;
      stock.push({
        id: id("stk"),
        productId: prd.id,
        warehouse: STOCK_WAREHOUSES[(pi2 + l) % STOCK_WAREHOUSES.length],
        lotNo: `L${String(now.getFullYear()).slice(2)}${String(1000 + pi2 * 3 + l)}`,
        qty,
        lockedQty: lock ? Math.round((qty * between(0.2, 0.6)) / prd.packQty) * prd.packQty : 0,
        lockedPiId: lock?.id ?? null,
        inboundOn: iso(inbound),
        /* 无纺布两年、器械三年，从入库日往后推。
           另有约四分之一是「进来时就快到期」的尾货 —— 清库存拿的低价单常常这样，
           临期预警要有东西可警，不然这个功能在演示里等于不存在。 */
        expiryOn: iso(
          inbound +
            (rand() < 0.26
              ? Math.round(between(60, 280))
              : prd.category === "安防电子"
                ? 3650
                : prd.category === "医疗器械"
                  ? 1095
                  : 730),
        ),
        note: null,
      });
    }
  });

  // ───────────── 运费询价 ─────────────
  const laneSeed = [
    { pol: "厦门", pod: "Callao", country: "秘鲁", mode: "海运" },
    { pol: "厦门", pod: "Santos", country: "巴西", mode: "海运" },
    { pol: "深圳", pod: "Jebel Ali", country: "阿联酋", mode: "海运" },
    { pol: "上海", pod: "Rotterdam", country: "荷兰", mode: "海运" },
    { pol: "厦门", pod: "Busan", country: "韩国", mode: "海运" },
    { pol: "青岛", pod: "Hamburg", country: "德国", mode: "海运" },
    { pol: "厦门", pod: "Manzanillo", country: "墨西哥", mode: "海运" },
    { pol: "广州", pod: "Sydney", country: "澳大利亚", mode: "海运" },
    { pol: "深圳", pod: "Frankfurt", country: "德国", mode: "空运" },
  ];
  const forwarders = ["中外运华南", "德迅 Kuehne+Nagel", "嘉里大通", "锦程物流", "飞力达", "中远海运物流"];
  const lanes: FreightLane[] = [];
  const freightQuotes: FreightQuote[] = [];
  laneSeed.forEach((ln, i) => {
    const askedOff = -Math.floor(between(2, 40));
    const laneId = id("lane");
    const n2 = 3 + Math.floor(rand() * 2);
    const picked = [...forwarders].sort(() => rand() - 0.5).slice(0, n2);
    const base20 = ln.mode === "空运" ? 0 : between(1400, 4200);
    const qs: FreightQuote[] = picked.map((fw) => {
      const k = between(0.9, 1.18);
      return {
        id: id("fq"),
        laneId,
        forwarder: fw,
        price20Cents: ln.mode === "空运" ? 0 : yuan(Math.round(base20 * k)),
        price40Cents: ln.mode === "空运" ? 0 : yuan(Math.round(base20 * k * 1.72)),
        perKgCents: ln.mode === "空运" ? yuan(Number(between(18, 34).toFixed(1))) : 0,
        transitDays: Math.round(between(ln.mode === "空运" ? 3 : 18, ln.mode === "空运" ? 6 : 42)),
        sailings: ln.mode === "空运" ? 7 : Math.round(between(1, 4)),
        // 运价有效期普遍很短，过期的报价不能再拿去核算成本
        validUntil: iso(askedOff + Math.round(between(10, 45))),
        note: null,
      };
    });
    freightQuotes.push(...qs);
    // 便宜不一定中标：船期密、航程短同样值钱，这里按「价 + 时效」的综合分挑
    const score = (q: FreightQuote) =>
      (q.price20Cents || q.perKgCents) / 100 + q.transitDays * 22 - q.sailings * 30;
    const best = [...qs].sort((a, b) => score(a) - score(b))[0];
    const status = askedOff < -20 ? "booked" : askedOff < -6 ? "quoted" : "open";
    lanes.push({
      id: laneId,
      laneNo: `FQ${String(now.getFullYear()).slice(2)}${String(700 + i)}`,
      pol: ln.pol,
      pod: ln.pod,
      country: ln.country,
      mode: ln.mode,
      askedOn: iso(askedOff),
      status,
      awardedQuoteId: status === "booked" ? best.id : null,
      note: null,
    });
  });

  // ───────────── 单证 ─────────────
  // 按目的国决定要不要加优惠原产地证 —— 给错了，客户清关多交关税，
  // 这是「齐套检查」真正要拦住的事，不是简单数够五份就行。
  const docs: DocRecord[] = [];
  db.shipments.filter((s) => !s.archived).forEach((sh, i) => {
    const need: string[] = [...DOC_KINDS];
    const form = FORM_BY_COUNTRY[sh.country];
    if (form) need.push(form);
    need.forEach((kind, k) => {
      // 越晚的批次，越可能还没出单证 —— 这样「缺件」是有理由的，不是随机缺
      const late = i % 7 === 0 && k >= 2;
      const missing = late && rand() < 0.55;
      if (missing) return;
      const st = sh.releaseState === "已放行" ? "filed" : rand() < 0.7 ? "issued" : "pending";
      docs.push({
        id: id("doc"),
        shipmentId: sh.id,
        kind,
        docNo: st === "pending" ? null : `${kind.slice(0, 2)}${Math.floor(between(100000, 999999))}`,
        issuedOn: st === "pending" ? null : iso(-Math.floor(between(1, 50))),
        status: st,
        note: null,
      });
    });
  });

  // ───────────── 登录记录 ─────────────
  const devices = ["Chrome 141 · macOS", "Chrome 141 · Windows", "Safari 19 · iPhone", "Edge 140 · Windows"];
  const logins: LoginLog[] = [];
  db.users.filter((u) => u.active).forEach((u, ui) => {
    for (let d = 0; d < 6; d++) {
      const off = -(d * Math.round(between(1, 4)) + Math.floor(between(0, 2)));
      const hour = Math.floor(between(8, 21));
      // 极少数落在凌晨、且 IP 不在常用段 —— 这就是要提醒的那种
      const odd = ui === 2 && d === 1;
      logins.push({
        id: id("lg"),
        userId: u.id,
        at: `${iso(off)}T${String(odd ? 3 : hour).padStart(2, "0")}:${String(Math.floor(between(0, 59))).padStart(2, "0")}:00`,
        ip: odd ? "103.28.44.19" : `58.22.${Math.floor(between(1, 254))}.${Math.floor(between(1, 254))}`,
        device: odd ? "Chrome 128 · Linux" : devices[(ui + d) % devices.length],
        method: d === 0 ? "password" : rand() < 0.3 ? "google" : "password",
        ok: !(ui === 1 && d === 4),
        risk: odd ? "非常用地登录（境外 IP），且发生在凌晨" : ui === 1 && d === 4 ? "口令错误" : null,
      });
    }
  });
  logins.sort((a, b) => b.at.localeCompare(a.at));

  return { suppliers, products, rfqs, rfqQuotes, contracts, productions, payments, accounts, stock, lanes, freightQuotes, docs, logins };
}

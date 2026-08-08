/**
 * 演示数据。
 *
 * 两个设计取舍值得写下来：
 *
 * 1. **时间轴跟着「今天」走。** 原始台账是照 2026-08-07 那天的真实业务写的，
 *    如果把日期写死，这个演示站放上半年后就会变成一堆「全部超期」的死数据。
 *    所以所有日期都按 today − ANCHOR 的差值整体平移 —— 停滞天数、里程碑超期、
 *    本月出运这些判定，任何时候打开都是活的。
 *
 * 2. **手写的那批行一个字都没改。** 客户备注、动态、产品名是照真实外贸业务写的，
 *    生成器写不出「并柜方还差一家没进仓，货代说最晚 8 号截仓」这种话。
 *    机器只负责在它们周围补量（够撑起分页、虚拟滚动、列筛选），主线剧情还是手写的。
 */

import type {
  AuditLog,
  Customer,
  Database,
  FxRate,
  MilestoneKind,
  OrderCosting,
  Pi,
  PiLine,
  PaymentTerm,
  ReleaseState,
  SellerEntity,
  ShipMode,
  Shipment,
  ShipmentLine,
  ShipmentMilestone,
  ShipmentNote,
  TaxInvoice,
  User,
} from "./types";
import { DB_VERSION, DEFAULT_MORE_OR_LESS_BP, lineAmount } from "./types";
import { TERM_TEMPLATES } from "./payment-terms";
import { buildOpsSeed } from "./ops-seed";
import { PRODUCT_SEED, buildProducts } from "./catalog";
import { emptyPresales } from "./presales-types";
import { emptyFlow } from "./flow-types";
import { buildPresalesSeed } from "./presales-seed";
import { buildFlowSeed } from "./flow-seed";
import { buildContacts, buildDemoAttachments } from "./seed-extra";

/** 原始台账的基准日 */
const ANCHOR = "2026-08-07";
const DAY = 86_400_000;

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function makeShift() {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return today - utc(ANCHOR);
}

/** 确定性伪随机：同一个种子在任何人机器上都得到同一份演示数据 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yuan = (n: number) => Math.round(n * 100);
const usd = (n: number) => Math.round(n * 100);

export function buildSeed(): Database {
  const shift = makeShift();
  /** 把原始台账里的日期平移到「今天」的时间轴上 */
  const d = (iso: string) => toIso(utc(iso) + shift);
  const month = (iso: string) => d(iso).slice(0, 7);
  const rand = mulberry32(20260807);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  const now = new Date().toISOString();
  let n = 0;
  const id = (p: string) => `${p}_${(++n).toString(36).padStart(4, "0")}`;

  // ───────────────────────── 用户 ─────────────────────────
  const userSeed: Array<Omit<User, "id" | "createdAt">> = [
    { username: "admin", name: "理查德", nameEn: "Richard", role: "admin", team: null, scope: "all", active: true, hue: 0 },
    { username: "ada", name: "Ada", role: "sales", team: "PPE组", scope: "self", active: true, hue: 1 },
    { username: "sophie", name: "Sophie", role: "sales", team: "PPE组", scope: "self", active: true, hue: 2 },
    { username: "sunny", name: "Sunny", role: "sales", team: "PPE组", scope: "self", active: true, hue: 3 },
    { username: "summer", name: "Summer", role: "sales", team: "CCTV组", scope: "team", active: true, hue: 4 },
    { username: "leo", name: "Leo", role: "sales", team: "CCTV组", scope: "self", active: true, hue: 5 },
    { username: "merch", name: "郑楠", nameEn: "Nathan Zheng", role: "merchandiser", team: "PPE组", scope: "team", active: true, hue: 6 },
    { username: "finance", name: "陈曦", nameEn: "Sherry Chen", role: "finance", team: null, scope: "all", active: true, hue: 7 },
    { username: "huang", name: "黄媛媛", nameEn: "Yuan Huang", role: "purchaser", team: null, scope: "all", active: true, hue: 8 },
    { username: "wei", name: "魏巍", nameEn: "Wei Wei", role: "purchaser", team: null, scope: "all", active: true, hue: 9 },
    { username: "viewer", name: "林珊", nameEn: "Shan Lin", role: "viewer", team: null, scope: "all", active: true, hue: 10 },
  ];
  const users: User[] = userSeed.map((u) => ({ ...u, id: id("usr"), createdAt: now }));
  const by = (name: string) => users.find((u) => u.name === name)!;
  const salesPool = users.filter((u) => u.role === "sales");

  // ───────────────────────── 开票主体 ─────────────────────────
  const sellerEntities: SellerEntity[] = [
    {
      id: id("ent"), name: "晓行天下", nameEn: "XIAOXING GLOBAL TRADING CO., LTD.",
      taxNo: "91350200MA2XXXXX1A",
      bank: "中国银行厦门分行", bankEn: "BANK OF CHINA, XIAMEN BRANCH",
      bankAcct: "4001 8830 2299 1075", swift: "BKCHCNBJ73A",
      addr: "厦门市湖里区枋湖东路 128 号 9 层", addrEn: "9F, No.128 Fanghu East Road, Huli District, Xiamen, Fujian, China",
      tel: "+86 592 5588 100", email: "docs@xiaoxing-global.com",
      active: true,
    },
    {
      id: id("ent"), name: "供应链", nameEn: "TRADEWIND SUPPLY CHAIN CO., LTD.",
      taxNo: "91350200MA2XXXXX2B",
      bank: "招商银行厦门分行", bankEn: "CHINA MERCHANTS BANK, XIAMEN BRANCH",
      bankAcct: "5919 0288 3301 6644", swift: "CMBCCNBS020",
      addr: "厦门市思明区展鸿路 82 号 21 层", addrEn: "21F, No.82 Zhanhong Road, Siming District, Xiamen, Fujian, China",
      tel: "+86 592 5588 200", email: "docs@tradewind-sc.com",
      active: true,
    },
  ];
  const [xiaoxing, supply] = sellerEntities;

  // ───────────────────────── 汇率 ─────────────────────────
  const fxRates: FxRate[] = [
    { id: id("fx"), base: "USD", quote: "CNY", kind: "market", rateE6: 6_739_200, asOf: now },
    { id: id("fx"), base: "USD", quote: "CNY", kind: "custom", rateE6: 6_700_000, asOf: now },
  ];

  // ───────────────────────── 客户 ─────────────────────────
  const coreCustomers = [
    { code: "C-US-001", name: "PacificPPE Inc.", country: "美国", contact: "Michael Reyes", creditLevel: "A", limit: 800_000, used: 512_400, tz: "America/Los_Angeles", sales: "Ada", note: "老客户，付款准时，对交期敏感；每批都要提前发装柜照片。" },
    { code: "C-PE-001", name: "Andes Trading", country: "秘鲁", contact: "Camila Rojas", creditLevel: "B", limit: 300_000, used: 268_900, tz: "America/Lima", sales: "Sophie", note: "下单频繁但单量小，额度已用 90%，再下单前需先回款。" },
    { code: "C-DE-001", name: "Rheinland GmbH", country: "德国", contact: "Jonas Weber", creditLevel: "A", limit: 600_000, used: 121_000, tz: "Europe/Berlin", sales: "Sophie", note: "DDU 条款，对单证要求严格，需要 EUR.1 和 CE 证书。" },
    { code: "C-AU-001", name: "Southern Cross", country: "澳大利亚", contact: "Emma Clarke", creditLevel: "B", limit: 250_000, used: 46_200, tz: "Australia/Sydney", sales: "Sunny", note: "澳洲检疫要求熏蒸证明，木托必须处理。" },
    { code: "C-SA-001", name: "Al Khuzama", country: "沙特", contact: "Faisal Al-Otaibi", creditLevel: "C", limit: 150_000, used: 129_790, tz: "Asia/Riyadh", sales: "Summer", note: "需要 SASO 认证，斋月期间沟通会变慢。" },
    { code: "C-CA-001", name: "NorthGate Supply", country: "加拿大", contact: "Olivia Tremblay", creditLevel: "B", limit: 200_000, used: 33_900, tz: "America/Toronto", sales: "Ada", note: "新客户，前两单走空运试单。" },
    { code: "C-RO-001", name: "Carpathia Med", country: "罗马尼亚", contact: "Andrei Popescu", creditLevel: "B", limit: 180_000, used: 52_100, tz: "Europe/Bucharest", sales: "Sunny", note: "走 FOB 武汉，指定货代联系不太及时。" },
    { code: "C-KR-001", name: "Hanil Medical", country: "韩国", contact: "Ji-woo Park", creditLevel: "A", limit: 220_000, used: 61_400, tz: "Asia/Seoul", sales: "Sophie", note: "需要正本 FORM K，报关资料要提前一周确认。" },
    { code: "C-CL-001", name: "Cono Sur SpA", country: "智利", contact: "Matías Fuentes", creditLevel: "B", limit: 160_000, used: 24_600, tz: "America/Santiago", sales: "Summer", note: "对唛头很讲究，改版要重新确认。" },
    { code: "C-GB-001", name: "Albion Safety Ltd", country: "英国", contact: "Harry Whitfield", creditLevel: "B", limit: 200_000, used: 38_500, tz: "Europe/London", sales: "Sophie", note: "DDP 条款，英国这端清关由我方安排。" },
    { code: "C-JP-001", name: "Sakura Medical KK", country: "日本", contact: "Haruto Sato", creditLevel: "A", limit: 260_000, used: 74_300, tz: "Asia/Tokyo", sales: "Leo", note: "验货标准高，出货前要第三方 QC 报告。" },
    { code: "C-MX-001", name: "Grupo Azteca", country: "墨西哥", contact: "Diego Herrera", creditLevel: "C", limit: 120_000, used: 96_800, tz: "America/Mexico_City", sales: "Summer", note: "回款慢，两次延期超过 30 天，控制放账。" },
    { code: "C-FR-001", name: "Lumière Santé", country: "法国", contact: "Claire Dubois", creditLevel: "A", limit: 340_000, used: 88_200, tz: "Europe/Paris", sales: "Sophie", note: "要求全法文标签与说明书，改版周期长。" },
    { code: "C-NL-001", name: "Delta Medisch BV", country: "荷兰", contact: "Bram de Vries", creditLevel: "A", limit: 300_000, used: 42_900, tz: "Europe/Amsterdam", sales: "Ada", note: "鹿特丹自提，仓库只在工作日上午收货。" },
    { code: "C-BR-001", name: "Amazônia Saúde", country: "巴西", contact: "Rafael Souza", creditLevel: "C", limit: 140_000, used: 118_400, tz: "America/Sao_Paulo", sales: "Leo", note: "清关手续复杂，需要提前 15 天备齐单证。" },
    { code: "C-ZA-001", name: "Cape Shield Ltd", country: "南非", contact: "Thabo Nkosi", creditLevel: "B", limit: 130_000, used: 27_600, tz: "Africa/Johannesburg", sales: "Sunny", note: "德班港经常压港，ETA 要留足缓冲。" },
    { code: "C-AE-001", name: "Gulf Medico FZE", country: "阿联酋", contact: "Omar Haddad", creditLevel: "A", limit: 400_000, used: 137_500, tz: "Asia/Dubai", sales: "Summer", note: "转口贸易为主，唛头不能出现原产地以外的信息。" },
    { code: "C-SG-001", name: "Straits Care Pte", country: "新加坡", contact: "Wei Ming Tan", creditLevel: "A", limit: 280_000, used: 51_300, tz: "Asia/Singapore", sales: "Leo", note: "小批量高频次，希望做 VMI 备货。" },
    { code: "C-PL-001", name: "Wisła Medical", country: "波兰", contact: "Anna Kowalska", creditLevel: "B", limit: 170_000, used: 63_700, tz: "Europe/Warsaw", sales: "Sophie", note: "走中欧班列，铁路运单要单独出。" },
    { code: "C-IT-001", name: "Adriatica Med Srl", country: "意大利", contact: "Giulia Ferrari", creditLevel: "B", limit: 190_000, used: 45_100, tz: "Europe/Rome", sales: "Ada", note: "八月全月休假，出货要避开。" },
    { code: "C-ES-001", name: "Iberia Protección", country: "西班牙", contact: "Pablo Ortiz", creditLevel: "B", limit: 165_000, used: 39_400, tz: "Europe/Madrid", sales: "Sunny", note: "巴伦西亚港，偏好整柜，拼柜不接受。" },
    { code: "C-TR-001", name: "Anadolu Sağlık", country: "土耳其", contact: "Mert Yılmaz", creditLevel: "C", limit: 110_000, used: 89_200, tz: "Europe/Istanbul", sales: "Summer", note: "汇率波动大，报价有效期只给 7 天。" },
    { code: "C-VN-001", name: "Mekong Safety JSC", country: "越南", contact: "Nguyen Van Minh", creditLevel: "B", limit: 125_000, used: 31_800, tz: "Asia/Ho_Chi_Minh", sales: "Leo", note: "近洋线，希望做到 7 天内到港。" },
    { code: "C-IN-001", name: "Bharat MedTech", country: "印度", contact: "Priya Nair", creditLevel: "C", limit: 150_000, used: 102_600, tz: "Asia/Kolkata", sales: "Sunny", note: "对价格极敏感，每次都要重新比价。" },
  ];

  const customers: Customer[] = coreCustomers.map((c) => ({
    id: id("cus"),
    code: c.code,
    name: c.name,
    country: c.country,
    contact: c.contact,
    creditLevel: c.creditLevel,
    sinosureLimitCents: usd(c.limit),
    sinosureUsedCents: usd(c.used),
    currency: "USD",
    /* 账期跟信用等级挂钩，这是外贸公司的通行做法：
       A 级放 60 天，B 级 30 天，C 级款到发货（C 级恰恰是最容易拖的那批） */
    termDays: c.creditLevel === "A" ? 60 : c.creditLevel === "B" ? 30 : 0,
    timezone: c.tz,
    note: c.note,
    active: true,
    salesId: by(c.sales).id,
    createdAt: now,
    updatedAt: now,
  }));
  const cus = (name: string) => customers.find((c) => c.name === name)!;

  // ───────────────────────── 产品目录 ─────────────────────────
  /* 产品要在 PI 之前建好 —— PI 的金额是明细行的合计，而明细行要挂产品。
     采购模块用的是同一批对象（同一组 id），两边才算一套数据。 */
  const products = buildProducts(id);
  const sellPrice = (sku: string) => PRODUCT_SEED.find((p) => p.sku === sku)!.sellE4;

  /** 产品描述 → 产品。手写的 PI 上写着「防护服 8 万件」，明细行要落到具体 SKU */
  const KEYWORDS: Array<[RegExp, string[]]> = [
    [/N95/i, ["MSK-N95"]],
    [/口罩/, ["MSK-SUR-3P", "MSK-N95"]],
    [/防护服/, ["PPE-COV-L", "PPE-COV-XL"]],
    [/隔离衣/, ["PPE-ISO-BLU"]],
    [/手术衣/, ["PPE-SRG"]],
    [/手套/, ["GLV-NIT-M"]],
    [/面屏/, ["PPE-FSH"]],
    [/录像机/, ["CCTV-NVR"]],
    [/摄像机/, ["CCTV-BUL", "CCTV-DOM"]],
    [/测温/, ["MED-THM"]],
    [/帽子/, ["PPE-CAP"]],
    [/鞋套/, ["PPE-SHC"]],
    [/棉签/, ["MED-SWB"]],
    [/袖套/, ["PPE-CAP", "PPE-SHC"]],
  ];
  const bySku = (sku: string) => products.find((p) => p.sku === sku)!;
  const matchProducts = (desc: string) => {
    for (const [re, skus] of KEYWORDS) if (re.test(desc)) return skus.map(bySku);
    return [pick(products)];
  };

  // ───────────────────────── PI + 明细行 + 订单核算 ─────────────────────────
  const pis: Pi[] = [];
  const piLines: PiLine[] = [];
  const costings: OrderCosting[] = [];

  /**
   * 把一张 PI 的目标金额拆成 1–3 行明细。
   *
   * ── 数量取 100 的倍数，不是为了好看 ──
   * 行金额 = qty × E4 单价 / 100。qty 是 100 的倍数时这个除法整除，
   * 明细行合计跟 PI 金额**一分不差**。否则每行都四舍五入一次，
   * 一张三行的单据能差出几十分钱 —— 客户拿计算器一按就发现单据自相矛盾。
   *
   * ── 返回真实合计，由它反过来决定 PI 金额 ──
   * 反过来做（先定 PI 金额再硬凑明细）永远凑不平，除非塞一行「尾差」，
   * 那种单据没法发给客户。
   */
  const makeLines = (piId: string, desc: string, targetUsd: number) => {
    const cands = matchProducts(desc);
    const nLines = targetUsd > 40_000 && cands.length > 1 ? (rand() < 0.45 ? 3 : 2) : rand() < 0.28 ? 2 : 1;
    const chosen: typeof products = [];
    for (let i = 0; i < nLines; i++) {
      const p = cands[i % cands.length] ?? pick(products);
      chosen.push(chosen.includes(p) ? pick(products.filter((x) => x.category === p.category && !chosen.includes(x))) ?? p : p);
    }

    // 权重：第一行是主角，后面的行是搭售，金额小
    const weights = chosen.map((_, i) => (i === 0 ? 1 : between(0.18, 0.45)));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const out: PiLine[] = [];

    chosen.forEach((prd, i) => {
      const targetCents = usd((targetUsd * weights[i]) / wSum);
      // 成交价在标准报价上下浮动 —— 老客户拿到的价格本来就不一样
      const unitPriceE4 = Math.max(1, Math.round(sellPrice(prd.sku) * between(0.9, 1.08)));
      const qty = Math.max(100, Math.round((targetCents * 100) / unitPriceE4 / 100) * 100);
      out.push({
        id: id("pil"),
        piId,
        seq: i + 1,
        productId: prd.id,
        name: prd.name,
        nameEn: prd.nameEn ?? null,
        hsCode: prd.hsCode,
        refundRateBp: prd.refundRateBp,
        qty,
        unit: prd.unit,
        unitPriceE4,
        // 采购价 = 主档最近成本上下浮动。lastCostCents 是「分」，明细行要 E4
        costE4: Math.round(prd.lastCostCents * 100 * between(0.94, 1.07)),
        packQty: prd.packQty,
        grossWeightG: prd.grossWeightG,
        volumeCm3: prd.volumeCm3,
        note: null,
      });
    });

    piLines.push(...out);
    return out.reduce((s, l) => s + lineAmount(l), 0);
  };

  const addPi = (p: {
    no: string; cus: string; sales: string; signed: string; amt: number; cost: number;
    ar: number; ap: number; bp: number; prod: string; est: boolean; entity: SellerEntity;
    settled?: boolean; currency?: string;
  }) => {
    const piId = id("pi");
    /* 明细行先生成，PI 金额由它们的合计决定 —— 单据上的合计必须等于明细行相加，
       这是客户拿计算器第一件会验的事。下面所有派生字段（应收、期间费用）
       都改用这个真实合计，不再用手写的 p.amt。 */
    const amtCents = makeLines(piId, p.prod, p.amt);
    const amt = amtCents / 100;
    pis.push({
      id: piId,
      piNo: p.no,
      signedOn: d(p.signed),
      currency: p.currency ?? "USD",
      amountCents: amtCents,
      product: p.prod,
      destination: cus(p.cus).country,
      status: p.settled ? "closed" : "open",
      customerId: cus(p.cus).id,
      salesId: by(p.sales).id,
      sellerEntityId: p.entity.id,
      quoteId: null,
      // 合同上的 "5% more or less"。分批对账判「出完没有」用的就是它
      moreOrLessBp: DEFAULT_MORE_OR_LESS_BP,
      createdAt: now,
      updatedAt: now,
    });
    costings.push({
      id: id("cst"),
      piId,
      purchaseCostCents: yuan(p.cost),
      /* 期间费用按占售价的比例摊，比例是照实际外贸口径给的：
         海运及本地费 5.5%、报关报检 0.9%、银行手续费 1.1%、其他 0.6%，合计约 8%。
         原来这四项分别是 42% / 12% / 8% / 3%，加起来 65% —— 在订单页看成本构成
         堆叠条看不出问题（没人拿它跟应收比），一到费用明细报表算「费用率」
         就变成 775%。金额单位也要留意：这四项是人民币，receivableCents 是美元。 */
      freightCents: yuan(amt * 0.055 * 6.7),
      customsCents: yuan(amt * 0.009 * 6.7),
      bankCents: yuan(amt * 0.011 * 6.7),
      otherCents: yuan(amt * 0.006 * 6.7),
      /* 应收按**比例**折算，不用手写的绝对值。
         明细行合计跟手写的 p.amt 会差几美元，绝对值照抄的话，
         本来「已全额收款」的单子会变成 99.98%，订单页上就多出一堆假的未收尾款。 */
      receivableCents: p.ar === 0 ? 0 : Math.round(amtCents * (p.ar / p.amt)),
      payableCents: yuan(p.ap),
      profitRateBp: p.bp,
      reviewState: p.bp < 0 ? "pending_review" : p.settled ? "confirmed" : "draft",
      settleState: p.settled ? "已完结" : "未完结",
      costEstimated: p.est,
      updatedAt: now,
    });
    return piId;
  };

  const corePis = [
    { no: "MT26X05162", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-02", amt: 19_224, cost: 113_760, ar: 19_224, ap: 63_760, bp: 2104, prod: "一次性防护服（L 码）", est: false, entity: xiaoxing },
    { no: "MT26X05163", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-02", amt: 19_224, cost: 113_760, ar: 19_224, ap: 63_760, bp: 2061, prod: "7.2 万件无纺布口罩（1 件一袋）", est: false, entity: xiaoxing },
    { no: "MT26X05164", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-03", amt: 19_224, cost: 113_760, ar: 19_224, ap: 65_760, bp: 1842, prod: "隔离衣 · 蓝色 XL", est: false, entity: xiaoxing },
    { no: "MT26X06186", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-14", amt: 19_224, cost: 115_200, ar: 19_224, ap: 85_200, bp: 2005, prod: "隔离衣（L 码）", est: true, entity: xiaoxing },
    { no: "MT26X06187", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-14", amt: 19_224, cost: 115_200, ar: 0, ap: 85_200, bp: 983, prod: "口罩 5.2 万件", est: true, entity: xiaoxing },
    { no: "MT26X06188", cus: "Andes Trading", sales: "Sophie", signed: "2026-07-15", amt: 21_400, cost: 152_600, ar: 0, ap: 152_600, bp: -241, prod: "医用外科口罩 30 万只", est: true, entity: xiaoxing },
    { no: "MT26X04118", cus: "PacificPPE Inc.", sales: "Ada", signed: "2026-06-11", amt: 168_400, cost: 906_500, ar: 168_400, ap: 620_400, bp: 2486, prod: "防护服 8 万件（分 5 批）", est: true, entity: xiaoxing },
    { no: "MT26X04119", cus: "Southern Cross", sales: "Sunny", signed: "2026-06-12", amt: 46_200, cost: 246_800, ar: 46_200, ap: 246_800, bp: 2031, prod: "防护面屏 12 万件", est: true, entity: xiaoxing },
    { no: "MT26X05132", cus: "Al Khuzama", sales: "Summer", signed: "2026-06-28", amt: 29_790, cost: 173_017, ar: 29_790, ap: 152_400, bp: 1422, prod: "ALKHUZAMA 牌一次性医用口罩", est: true, entity: xiaoxing, settled: true },
    { no: "MT26X06203", cus: "Rheinland GmbH", sales: "Sophie", signed: "2026-07-18", amt: 58_900, cost: 322_400, ar: 29_450, ap: 322_400, bp: 1788, prod: "隔离衣 6 万件 · DDU 汉堡", est: true, entity: xiaoxing },
    { no: "MT26X06190", cus: "Cono Sur SpA", sales: "Summer", signed: "2026-07-16", amt: 24_600, cost: 138_900, ar: 24_600, ap: 96_300, bp: 2247, prod: "监控摄像机 800 台", est: true, entity: supply },
    { no: "MT26X07235", cus: "NorthGate Supply", sales: "Ada", signed: "2026-07-28", amt: 33_900, cost: 0, ar: 33_900, ap: 0, bp: 432, prod: "监控摄像机 1500 台", est: false, entity: supply },
    { no: "MT26X05144", cus: "Carpathia Med", sales: "Sunny", signed: "2026-07-05", amt: 42_600, cost: 231_500, ar: 12_780, ap: 180_200, bp: 1934, prod: "一次性手术衣 9 万件（分 2 批）", est: true, entity: xiaoxing },
    { no: "MT26X05151", cus: "Hanil Medical", sales: "Sophie", signed: "2026-07-08", amt: 37_800, cost: 205_400, ar: 37_800, ap: 205_400, bp: 2118, prod: "防护口罩 24 万只", est: true, entity: xiaoxing },
    { no: "MT26X04120", cus: "Albion Safety Ltd", sales: "Sophie", signed: "2026-06-20", amt: 38_500, cost: 214_600, ar: 19_250, ap: 160_400, bp: 1652, prod: "一次性检查手套 40 万只 · DDP", est: true, entity: supply },
  ];
  for (const p of corePis) addPi(p);

  // 补量：把台账撑到 60+ 单，分页、排序、虚拟滚动才有东西可跑
  /* 这是 PI 上那句「一句话产品描述」的语料，不是产品主档 ——
     明细行由 makeLines 按关键词把它落到具体 SKU 上 */
  const productDescs = [
    "一次性防护服（XL 码）", "医用外科口罩 50 万只", "N95 防护口罩 12 万只", "一次性隔离衣（蓝色）",
    "丁腈检查手套 60 万只", "防护面屏 8 万件", "一次性帽子 30 万只", "医用鞋套 40 万双",
    "红外测温枪 6000 支", "监控摄像机 2200 台", "网络硬盘录像机 900 台", "一次性手术衣 5 万件",
    "无纺布袖套 20 万副", "医用棉签 100 万支", "半球形网络摄像机 1400 台",
  ];
  const genCustomers = customers.slice(10);
  for (let i = 0; i < 48; i++) {
    const c = pick(genCustomers);
    const salesUser = users.find((u) => u.id === c.salesId) ?? pick(salesPool);
    const signedOffset = -Math.floor(between(2, 150));
    const amt = Math.round(between(8_000, 96_000));
    // 利润率分档要覆盖到亏损与预警，看板的分布图和风险清单才有内容
    const roll = rand();
    const bp = roll < 0.07 ? -Math.round(between(30, 640)) : roll < 0.22 ? Math.round(between(180, 1090)) : Math.round(between(1180, 2860));
    const settled = signedOffset < -95 && rand() < 0.6;
    addPi({
      no: `MT26X${String(1 + Math.floor(rand() * 8)).padStart(2, "0")}${String(300 + i).padStart(3, "0")}`,
      cus: c.name,
      sales: salesUser.name,
      signed: toIso(utc(ANCHOR) + signedOffset * DAY),
      amt,
      cost: rand() < 0.08 ? 0 : Math.round(amt * 6.7 * between(0.72, 0.9)),
      ar: rand() < 0.3 ? 0 : Math.round(amt * (rand() < 0.5 ? 1 : 0.5)),
      ap: Math.round(amt * 6.7 * between(0.6, 0.88)),
      bp,
      prod: pick(productDescs),
      est: rand() < 0.75,
      entity: rand() < 0.68 ? xiaoxing : supply,
      settled,
    });
  }
  const pi = (no: string) => pis.find((p) => p.piNo === no)!;

  // ───────────────────────── 出运批次 + 里程碑 + 动态 ─────────────────────────
  const shipments: Shipment[] = [];
  const milestones: ShipmentMilestone[] = [];
  const notes: ShipmentNote[] = [];

  type MS = [kind: MilestoneKind, planned: string | null, actual: string | null];
  const addShipment = (s: {
    no: string; label?: string; pi: string; country: string; term: string; mode?: ShipMode;
    fcl: boolean; cn?: string; carrier?: string; pod?: string; rel: ReleaseState; sales: string;
    team: string; note?: string; noteOn?: string; todo?: boolean; ms: MS[]; history?: Array<[string, string]>;
  }) => {
    const sid = id("shp");
    shipments.push({
      id: sid,
      batchNo: s.no,
      batchLabel: s.label ?? null,
      country: s.country,
      term: s.term,
      mode: s.mode ?? "海运",
      fcl: s.fcl,
      containerNo: s.cn ?? null,
      carrier: s.carrier ?? null,
      pod: s.pod ?? null,
      releaseState: s.rel,
      team: s.team,
      latestNote: s.note ?? null,
      latestNoteOn: s.noteOn ? d(s.noteOn) : null,
      hasTodo: s.todo ?? false,
      archived: false,
      piId: pi(s.pi).id,
      salesId: by(s.sales).id,
      createdAt: now,
      updatedAt: now,
    });
    s.ms.forEach(([kind, planned, actual], i) =>
      milestones.push({
        id: id("mst"),
        shipmentId: sid,
        kind,
        seq: i,
        plannedOn: planned ? d(planned) : null,
        actualOn: actual ? d(actual) : null,
      }),
    );
    if (s.note && s.noteOn) {
      notes.push({ id: id("not"), shipmentId: sid, body: s.note, happenedOn: d(s.noteOn), authorId: by(s.sales).id, createdAt: now });
      for (const [body, on] of s.history ?? []) {
        notes.push({ id: id("not"), shipmentId: sid, body, happenedOn: d(on), authorId: by(s.sales).id, createdAt: now });
      }
    }
    return sid;
  };

  const coreShipments: Parameters<typeof addShipment>[0][] = [
    { no: "MT26X04118-4", label: "第4批", pi: "MT26X04118", country: "美国", term: "FOB-SH", fcl: true, cn: "TCNU4968789", carrier: "ONE", pod: "洛杉矶", rel: "已放行", sales: "Ada", team: "PPE组", note: "待客户付尾款后电放", noteOn: "2026-08-05", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-07-19", "2026-07-19"], ["ATD", "2026-08-02", "2026-08-02"], ["ETA", "2026-08-21", null]], history: [["提单确认无误，已提交船司", "2026-08-02"], ["装柜照片已发客户，客户确认无误", "2026-07-19"]] },
    { no: "MT26X06203-1", pi: "MT26X06203", country: "德国", term: "DDU", fcl: true, cn: "CAJU5340821", carrier: "ONE", pod: "汉堡", rel: "已放行", sales: "Sophie", team: "PPE组", note: "待收 BL COPY，此票开船后需要找货代确认 ETA", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-08-01", "2026-08-01"], ["ATD", "2026-08-09", null], ["ETA", null, null]], history: [["EUR.1 已办妥，CE 证书随箱", "2026-08-01"], ["工厂交货完成，安排装柜", "2026-07-31"]] },
    { no: "MT26X04119-1", pi: "MT26X04119", country: "澳大利亚", term: "FOB-WH", fcl: true, cn: "TSSU5067819", carrier: "TSL", pod: "BRISBANE", rel: "已放行", sales: "Sunny", team: "PPE组", note: "尾款已收 + 文件已确认，待沟通好费用问题即可放单", noteOn: "2026-08-04", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-08-02", "2026-08-02"], ["ATD", "2026-08-04", "2026-08-04"], ["ETA", "2026-09-11", null]], history: [["熏蒸证明已出，木托合规", "2026-08-02"]] },
    { no: "MT26X05144-1", label: "第1批", pi: "MT26X05144", country: "罗马尼亚", term: "FOB-WH", fcl: false, pod: "康斯坦察", rel: "未放行", sales: "Sunny", team: "PPE组", note: "待明天上午找指代拿放箱令", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-08-01", "2026-08-01"], ["装柜", "2026-08-10", null], ["进仓", null, null], ["ATD", null, null], ["ETA", null, null]], history: [["指代电话一直没人接，已发邮件催", "2026-08-04"]] },
    { no: "MT26X05132-1", pi: "MT26X05132", country: "沙特", term: "FOB-GZ", fcl: true, cn: "PCIU9185538", carrier: "PIL", pod: "吉达", rel: "已放行", sales: "Summer", team: "CCTV组", note: "SC 已出，尾款到账后电放", noteOn: "2026-07-22", ms: [["交期", "2026-07-09", "2026-07-09"], ["装柜", "2026-07-10", "2026-07-10"], ["ATD", "2026-07-21", "2026-07-21"], ["ETA", "2026-08-13", null]], history: [["SASO 认证已随附", "2026-07-10"]] },
    { no: "MT26X04118-5", label: "第5批", pi: "MT26X04118", country: "美国", term: "FOB-SH", fcl: true, cn: "SMCU1019790", carrier: "SML", pod: "洛杉矶", rel: "已放行", sales: "Ada", team: "PPE组", note: "待客户确认清关资料 + 付尾款", noteOn: "2026-08-06", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-07-23", "2026-07-23"], ["ATD", "2026-08-06", "2026-08-06"], ["ETA", "2026-08-23", null]], history: [["清关资料草稿已发客户核对", "2026-08-04"]] },
    { no: "MT26X05151-1", pi: "MT26X05151", country: "韩国", term: "FOB-WH", fcl: true, cn: "TBJU7316640", carrier: "SIT", pod: "仁川", rel: "待报关", sales: "Sophie", team: "PPE组", note: "待柜子到厦门后报关；待船开后拿到 BL COPY 申请正本 FORM K + 电放", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-08-05", "2026-08-05"], ["装柜", "2026-08-05", null], ["ATD", "2026-08-07", null], ["ETA", null, null]], history: [["报关资料客户已确认", "2026-08-01"]] },
    { no: "MT26X06188-1", pi: "MT26X06188", country: "秘鲁", term: "CIF", fcl: false, pod: "卡亚俄", rel: "未放行", sales: "Sophie", team: "PPE组", note: "工厂说面料还没到，已催 3 次没有明确交期", noteOn: "2026-07-28", todo: true, ms: [["交期", "2026-07-28", null], ["装柜", null, null], ["进仓", null, null], ["ATD", null, null], ["ETA", null, null]], history: [["工厂第一次答复面料延期一周", "2026-07-21"]] },
    { no: "MT26X07235-1", pi: "MT26X07235", country: "加拿大", term: "FOB-SZ", mode: "空运", fcl: true, cn: "AWB 297-88451203", carrier: "CX", pod: "多伦多", rel: "已放行", sales: "Ada", team: "CCTV组", note: "已交空运公司，等 AWB 号", noteOn: "2026-08-05", ms: [["交期", "2026-08-03", "2026-08-03"], ["装柜", "2026-08-04", "2026-08-04"], ["ATD", "2026-08-05", "2026-08-05"], ["ETA", "2026-08-07", null]] },
    { no: "MT26X05144-2", label: "第2批", pi: "MT26X05144", country: "罗马尼亚", term: "FOB-WH", fcl: true, pod: "康斯坦察", rel: "未放行", sales: "Sunny", team: "PPE组", ms: [["交期", "2026-08-18", null], ["装柜", null, null], ["ATD", null, null], ["ETA", null, null]] },
    { no: "MT26X06190-1", pi: "MT26X06190", country: "智利", term: "FOB-SH", fcl: true, cn: "MSCU7712004", carrier: "MSC", pod: "圣安东尼奥", rel: "已放行", sales: "Summer", team: "CCTV组", note: "客户要求改唛头，已让工厂重新印刷", noteOn: "2026-07-25", todo: true, ms: [["交期", "2026-07-20", "2026-07-20"], ["装柜", "2026-07-25", "2026-07-25"], ["ATD", "2026-07-29", "2026-07-29"], ["ETA", "2026-09-02", null]] },
    { no: "MT26X04120-1", pi: "MT26X04120", country: "英国", term: "DDP", fcl: false, cn: "拼柜 · 待配柜", carrier: "COSCO", pod: "费利克斯托", rel: "待报关", sales: "Sophie", team: "PPE组", note: "并柜方还差一家没进仓，货代说最晚 8 号截仓", noteOn: "2026-08-04", todo: true, ms: [["交期", "2026-07-30", "2026-07-30"], ["装柜", "2026-08-04", "2026-08-04"], ["进仓", "2026-08-08", null], ["ATD", null, null], ["ETA", null, null]] },
  ];
  for (const s of coreShipments) addShipment(s);

  // 补量出运批次
  const carriers = ["ONE", "MSC", "COSCO", "MAERSK", "CMA", "PIL", "SITC", "EMC", "HMM", "OOCL"];
  const terms = ["FOB-SH", "FOB-WH", "FOB-GZ", "FOB-SZ", "CIF", "DDU", "DDP", "CFR", "EXW"];
  const pods = ["洛杉矶", "汉堡", "鹿特丹", "仁川", "迪拜", "圣保罗", "德班", "巴伦西亚", "热那亚", "新加坡", "海防", "孟买", "格但斯克", "东京"];
  const genNotes = [
    "货代已回签，等船期确认",
    "客户要求推迟一周出运，已跟工厂确认可以压货",
    "正本单证已寄出，快递单号已发客户",
    "进仓时间已约好，司机信息已同步仓库",
    "尾款已收，安排放单",
    "报关行反馈品名需要补充规格，已让工厂出具说明",
    "订舱成功，截关时间已同步工厂",
    "客户改了收货地址，运费需要重新核",
    "验货报告已出，合格放行",
    "船期延误两天，已通知客户更新 ETA",
  ];

  const genPis = pis.filter((p) => !corePis.some((c) => c.no === p.piNo) && p.status !== "closed");
  genPis.slice(0, 66).forEach((p, i) => {
    const c = customers.find((x) => x.id === p.customerId)!;
    const salesUser = users.find((u) => u.id === p.salesId)!;
    const fcl = rand() < 0.72;
    const mode: ShipMode = rand() < 0.86 ? "海运" : rand() < 0.6 ? "空运" : "快递";

    // 时间轴反着推：先决定这票走到第几步，再把「下一个待办节点」摆到今天附近。
    // 不这么做的话，随机出来的批次绝大多数都会显示成超期 —— 演示站一屏全红，
    // 反而看不出「超期」这个信号本来想说什么。
    const kinds: MilestoneKind[] = fcl ? ["交期", "装柜", "ATD", "ETA"] : ["交期", "装柜", "进仓", "ATD", "ETA"];
    const offsets = fcl ? [0, 5, 9, 33] : [0, 5, 7, 11, 35];
    const stage = Math.floor(rand() * (kinds.length + 1)); // 已完成的节点数
    const pivot = Math.min(stage, kinds.length - 1);
    const delta = rand() < 0.14 ? -Math.floor(between(1, 9)) : Math.floor(between(0, 15));
    const base = delta - offsets[pivot];
    const iso = (off: number) => toIso(utc(ANCHOR) + (base + off) * DAY);
    const ms: MS[] = kinds.map((kind, k) => [
      kind,
      iso(offsets[k]),
      // 实际发生日在计划日附近抖一两天，跟真实台账一样很少正好对上
      k < stage ? iso(offsets[k] + (rand() < 0.4 ? 1 : 0)) : null,
    ]);

    // 大部分批次这几天都有人在跟，少数才会掉成「停滞」
    const noteOffset = rand() < 0.84 ? -Math.floor(between(0, 7)) : -Math.floor(between(8, 26));
    addShipment({
      no: `${p.piNo}-1`,
      pi: p.piNo,
      country: c.country,
      term: pick(terms),
      mode,
      fcl,
      cn: stage >= 2 ? `${pick(["TCNU", "MSCU", "CAJU", "TGHU", "SMCU", "OOLU"])}${Math.floor(between(1_000_000, 9_999_999))}` : undefined,
      carrier: stage >= 2 ? pick(carriers) : undefined,
      pod: pick(pods),
      rel: stage >= 3 ? "已放行" : stage === 2 ? "待报关" : "未放行",
      sales: salesUser.name,
      team: salesUser.team ?? "PPE组",
      note: rand() < 0.88 ? genNotes[i % genNotes.length] : undefined,
      noteOn: rand() < 0.88 ? toIso(utc(ANCHOR) + noteOffset * DAY) : undefined,
      todo: rand() < 0.2,
      ms,
    });
  });

  // ───────────────────────── 退税发票 ─────────────────────────
  const taxInvoices: TaxInvoice[] = [];
  const addTax = (t: {
    buyer: string; seller: string; inv: string; item: string; qty: number; gross: number;
    net: number; tax: number; exp: string; cn: string; usd: number; ent: SellerEntity; link: string | null;
  }) => {
    taxInvoices.push({
      id: id("tax"),
      declareMonth: month(t.exp),
      batch: "001",
      buyer: t.buyer,
      sellerName: t.seller,
      invoiceNo: t.inv,
      item: t.item,
      qty: t.qty,
      grossCents: yuan(t.gross),
      netCents: yuan(t.net),
      taxCents: yuan(t.tax),
      exportedOn: d(t.exp),
      customsNo: t.cn,
      customsUsdCents: usd(t.usd),
      piId: t.link ? pi(t.link).id : null,
      sellerEntityId: t.ent.id,
      createdAt: now,
    });
  };

  const coreTax = [
    { buyer: "魏巍", seller: "泉州黑鹰威视电子科技有限公司", inv: "12354076", item: "公共安全设备*监控摄像机", qty: 1500, gross: 140_250, net: 124_115.04, tax: 16_134.96, exp: "2026-07-10", cn: "531620260002305", usd: 19_845, ent: supply, link: "MT26X07235" },
    { buyer: "黄媛媛", seller: "厦门安洁无纺制品有限公司", inv: "07788312", item: "纺织产品*ALKHUZAMA 牌一次性医用口罩", qty: 320_200, gross: 195_510, net: 173_017.7, tax: 22_492.3, exp: "2026-07-22", cn: "471420260001204", usd: 29_790, ent: xiaoxing, link: "MT26X05132" },
    { buyer: "黄媛媛", seller: "江苏正阳防护用品有限公司", inv: "35660411", item: "纺织产品*一次性隔离衣", qty: 70_200, gross: 83_300, net: 73_716.81, tax: 9_583.19, exp: "2026-07-09", cn: "471420260000873", usd: 11_640.5, ent: xiaoxing, link: "MT26X06188" },
    { buyer: "黄媛媛", seller: "浙江宏达医疗器械有限公司", inv: "29734121", item: "纺织产品*一次性医用口罩", qty: 366_000, gross: 26_352, net: 23_320.35, tax: 3_031.65, exp: "2026-07-06", cn: "471420260000664", usd: 4_113.71, ent: xiaoxing, link: null },
    { buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29775830", item: "纺织产品*一次性手术衣", qty: 90_000, gross: 23_760, net: 21_026.55, tax: 2_733.45, exp: "2026-07-07", cn: "471420260000665", usd: 3_007.35, ent: xiaoxing, link: null },
    { buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29774271", item: "纺织产品*一次性帽子", qty: 154_000, gross: 9_240, net: 8_176.99, tax: 1_063.01, exp: "2026-07-09", cn: "471420260000666", usd: 1_294.71, ent: xiaoxing, link: "MT26X05144" },
    { buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29775671", item: "纺织产品*一次性防护服", qty: 18_200, gross: 31_000, net: 27_433.63, tax: 3_566.37, exp: "2026-07-09", cn: "471420260000667", usd: 16_648.01, ent: xiaoxing, link: "MT26X05144" },
    { buyer: "黄媛媛", seller: "江苏正阳防护用品有限公司", inv: "29775758", item: "纺织产品*一次性袖套", qty: 86_000, gross: 8_240, net: 7_292.04, tax: 947.96, exp: "2026-07-09", cn: "471420260000668", usd: 1_305.88, ent: supply, link: "MT26X04120" },
    { buyer: "林珊", seller: "湖北真诚无纺布制品有限公司", inv: "29775831", item: "纺织产品*一次性鞋套", qty: 300_000, gross: 29_800, net: 26_371.68, tax: 3_428.32, exp: "2026-07-09", cn: "471420260000669", usd: 0, ent: supply, link: "MT26X04120" },
    { buyer: "林珊", seller: "湖北真诚无纺布制品有限公司", inv: "29775832", item: "纺织产品*一次性实验服", qty: 25_000, gross: 55_500, net: 49_115.04, tax: 6_384.96, exp: "2026-07-09", cn: "471420260000670", usd: 7_420.4, ent: supply, link: null },
    { buyer: "黄媛媛", seller: "厦门安洁无纺制品有限公司", inv: "29661204", item: "纺织产品*一次性防护服", qty: 80_000, gross: 268_400, net: 237_522.12, tax: 30_877.88, exp: "2026-06-24", cn: "471420260000512", usd: 40_100, ent: xiaoxing, link: "MT26X04118" },
    { buyer: "魏巍", seller: "泉州黑鹰威视电子科技有限公司", inv: "29660881", item: "公共安全设备*监控摄像机", qty: 800, gross: 96_300, net: 85_221.24, tax: 11_078.76, exp: "2026-06-28", cn: "531620260002104", usd: 14_320, ent: supply, link: "MT26X06190" },
  ];
  for (const t of coreTax) addTax(t);

  const suppliers = [
    "厦门安洁无纺制品有限公司", "江苏正阳防护用品有限公司", "浙江宏达医疗器械有限公司",
    "湖北康泰无纺布制品有限公司", "湖北真诚无纺布制品有限公司", "泉州黑鹰威视电子科技有限公司",
    "广东恒安医疗用品有限公司", "山东华康防护科技有限公司",
  ];
  const items = [
    "纺织产品*一次性防护服", "纺织产品*一次性医用口罩", "纺织产品*一次性隔离衣",
    "纺织产品*一次性手术衣", "纺织产品*一次性帽子", "纺织产品*一次性鞋套",
    "公共安全设备*监控摄像机", "公共安全设备*网络硬盘录像机", "橡胶制品*丁腈检查手套",
  ];
  const buyers = ["黄媛媛", "魏巍", "林珊"];
  for (let i = 0; i < 84; i++) {
    const gross = Math.round(between(6_000, 240_000) * 100) / 100;
    const net = Math.round((gross / 1.13) * 100) / 100;
    const tax = Math.round((gross - net) * 100) / 100;
    const exp = toIso(utc(ANCHOR) - Math.floor(between(1, 200)) * DAY);
    const linked = rand() < 0.78;
    addTax({
      buyer: pick(buyers),
      seller: pick(suppliers),
      inv: String(29_600_000 + Math.floor(rand() * 400_000)),
      item: pick(items),
      qty: Math.round(between(500, 400_000)),
      gross,
      net,
      tax,
      exp,
      cn: `4714202600${String(Math.floor(between(10_000, 99_999)))}`,
      usd: Math.round(between(1_000, 46_000)),
      ent: rand() < 0.6 ? xiaoxing : supply,
      link: linked ? pick(pis).piNo : null,
    });
  }

  // ───────────────────────── 审计日志 ─────────────────────────
  // 灌一批历史留痕，否则审计页面首屏是空的，看不出这个模块干嘛的
  const auditLogs: AuditLog[] = [];
  const actions = [
    { action: "更新动态", entity: "Shipment" },
    { action: "批量更新", entity: "Shipment" },
    { action: "修改放行状态", entity: "Shipment" },
    { action: "关联退税发票", entity: "TaxInvoice" },
    { action: "更新核算", entity: "OrderCosting" },
  ];
  for (let i = 0; i < 46; i++) {
    const a = pick(actions);
    const actor = pick(users.filter((u) => u.role !== "viewer"));
    const target = a.entity === "TaxInvoice" ? pick(taxInvoices) : a.entity === "Shipment" ? pick(shipments) : pick(pis);
    const label =
      "batchNo" in target ? target.batchNo : "invoiceNo" in target ? target.invoiceNo : (target as Pi).piNo;
    const at = new Date(Date.now() - Math.floor(between(1, 60 * 24 * 26)) * 60_000).toISOString();
    auditLogs.push({
      id: id("aud"),
      actorId: actor.id,
      actorName: actor.name,
      entity: a.entity,
      entityId: target.id,
      entityLabel: label,
      action: a.action,
      before: JSON.stringify({ 值: "变更前" }),
      after: JSON.stringify({ 值: "变更后" }),
      at,
    });
  }
  auditLogs.sort((a, b) => b.at.localeCompare(a.at));

  /* ── 分批出运明细 ──────────────────────────────────────────
     一张 PI 的订单量要摊到它的各个批次上。没有这张表，给「第 4 批」
     开装箱单打出来的会是整张 PI 的数量。

     摊法：按批次平均分，除不尽的零头全给最后一批（现实里也是这样，
     最后一票扫尾）。少数单子刻意留一点没出完 / 稍微超装，
     好让「待出」和「溢短装」这两种状态在演示数据里真的看得见。 */
  const shipmentLines: ShipmentLine[] = [];
  const byPi = new Map<string, Shipment[]>();
  for (const s of shipments) {
    if (!s.piId) continue;
    const arr = byPi.get(s.piId) ?? [];
    arr.push(s);
    byPi.set(s.piId, arr);
  }
  for (const [piId, batches] of byPi) {
    // 批次号里带序号（-1 / -4），按它排才是真实的出运顺序
    batches.sort((a, b) => a.batchNo.localeCompare(b.batchNo, undefined, { numeric: true }));
    for (const l of piLines.filter((x) => x.piId === piId)) {
      const roll = rand();
      // 12% 还没出完（在途/待排），8% 轻微超装 —— 都在 ±5% 之外才有信号意义
      const shipRatio = roll < 0.12 ? 0.55 + rand() * 0.3 : roll < 0.2 ? 1.02 + rand() * 0.06 : 1;
      const total = Math.round(l.qty * shipRatio);
      const per = Math.floor(total / batches.length);
      batches.forEach((s, i) => {
        const qty = i === batches.length - 1 ? total - per * (batches.length - 1) : per;
        if (qty <= 0) return;
        shipmentLines.push({
          id: id("shl"),
          shipmentId: s.id,
          piLineId: l.id,
          qty,
          // 演示数据里留空，走「按包装参数推算」那条路 —— 那才是多数用户的实际用法
          cartons: null,
          grossWeightG: null,
          volumeCm3: null,
        });
      });
    }
  }

  /* ── 收款计划 ──────────────────────────────────────────────
     原来 PI 上只有一句自由文本的付款方式。拆成分期之后，定金和尾款
     各有各的触发事件和到期日 —— 应收账龄才能按期催，而不是按单一刀切。
     分布照着真实业务来：多数 30/70 见提单，少数款到发货和放账。 */
  const paymentTerms: PaymentTerm[] = [];
  for (const p of pis) {
    const roll = rand();
    const tpl =
      roll < 0.62 ? TERM_TEMPLATES[0] : roll < 0.78 ? TERM_TEMPLATES[2] : roll < 0.9 ? TERM_TEMPLATES[1] : TERM_TEMPLATES[3];
    for (const t of tpl.terms) paymentTerms.push({ ...t, id: id("pt"), piId: p.id });
  }

  const base: Database = {
    version: DB_VERSION,
    seededAt: now,
    lastExportAt: null,
    users,
    customers,
    contacts: buildContacts(customers, id),
    sellerEntities,
    pis,
    piLines,
    costings,
    paymentTerms,
    shipments,
    shipmentLines,
    milestones,
    notes,
    taxInvoices,
    fxRates,
    auditLogs,
    savedViews: [],
    attachments: [],
    // 口令摘要要跑 PBKDF2，是异步的；seed 保持同步，凭据在 db.load() 里补齐
    credentials: [],
    ops: { suppliers: [], products: [], rfqs: [], rfqQuotes: [], contracts: [], productions: [], payments: [], accounts: [], stock: [], lanes: [], freightQuotes: [], docs: [], logins: [] },
    presales: emptyPresales(),
    flow: emptyFlow(),
  };
  // 采购与资金要挂在已有的 PI / 客户上，所以得等主数据齐了再生成
  base.ops = buildOpsSeed(base, products);
  // 售前挂客户和产品；审批 / 通知 / 往来又挂在售前和订单上，顺序不能反
  base.presales = buildPresalesSeed(base);
  base.flow = buildFlowSeed(base);
  base.attachments = buildDemoAttachments(base);
  return base;
}

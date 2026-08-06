/**
 * 演示数据。金额一律以「分」为单位存整数。
 * 重跑安全：先清空业务表再灌数据。
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { scryptSync, randomBytes } from "node:crypto";
import process from "node:process";
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* 用进程环境变量 */
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

/** 与 src/lib/password.ts 保持一致的算法 */
function hashPassword(plain: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const yuan = (n: number) => BigInt(Math.round(n * 100));
const usd = (n: number) => BigInt(Math.round(n * 100));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  // 清空顺序照外键依赖来
  await db.auditLog.deleteMany();
  await db.taxInvoice.deleteMany();
  await db.shipmentNote.deleteMany();
  await db.shipmentMilestone.deleteMany();
  await db.shipment.deleteMany();
  await db.orderCosting.deleteMany();
  await db.pi.deleteMany();
  await db.customer.deleteMany();
  await db.sellerEntity.deleteMany();
  await db.fxRate.deleteMany();
  await db.user.deleteMany();

  // ---------- 用户 ----------
  const users = await Promise.all(
    [
      { username: "admin", name: "尤麒翔", role: "admin", team: null, scope: "all" },
      { username: "ada", name: "Ada", role: "sales", team: "PPE组", scope: "self" },
      { username: "sophie", name: "Sophie", role: "sales", team: "PPE组", scope: "self" },
      { username: "sunny", name: "Sunny", role: "sales", team: "PPE组", scope: "self" },
      { username: "summer", name: "Summer", role: "sales", team: "CCTV组", scope: "self" },
      { username: "finance", name: "陈曦", role: "finance", team: null, scope: "all" },
      { username: "huang", name: "黄媛媛", role: "purchaser", team: null, scope: "all" },
      { username: "wei", name: "魏巍", role: "purchaser", team: null, scope: "all" },
    ].map((u) =>
      db.user.create({
        data: { ...u, team: u.team ?? undefined, passwordHash: hashPassword("demo1234") },
      }),
    ),
  );
  const by = (name: string) => users.find((u) => u.name === name)!;

  // ---------- 开票主体 ----------
  const [xiaoxing, supply] = await Promise.all([
    db.sellerEntity.create({ data: { name: "晓行天下", taxNo: "91350200MA2XXXXX1A" } }),
    db.sellerEntity.create({ data: { name: "供应链", taxNo: "91350200MA2XXXXX2B" } }),
  ]);

  // ---------- 汇率 ----------
  await db.fxRate.createMany({
    data: [
      { base: "USD", quote: "CNY", kind: "market", rateE6: 6_739_200 },
      { base: "USD", quote: "CNY", kind: "custom", rateE6: 6_700_000 },
    ],
  });

  // ---------- 客户 ----------
  const customerSeed = [
    { code: "C-US-001", name: "PacificPPE Inc.", country: "美国", contact: "Michael Reyes", creditLevel: "A", limit: 800_000, used: 512_400, tz: "America/Los_Angeles", sales: "Ada", note: "老客户，付款准时，对交期敏感；每批都要提前发装柜照片。" },
    { code: "C-PE-001", name: "Andes Trading", country: "秘鲁", contact: "Camila Rojas", creditLevel: "B", limit: 300_000, used: 268_900, tz: "America/Lima", sales: "Sophie", note: "下单频繁但单量小，额度已用 90%，再下单前需先回款。" },
    { code: "C-DE-001", name: "Rheinland GmbH", country: "德国", contact: "Jonas Weber", creditLevel: "A", limit: 600_000, used: 121_000, tz: "Europe/Berlin", sales: "Sophie", note: "DDU 条款，对单证要求严格，需要 EUR.1 和 CE 证书。" },
    { code: "C-AU-001", name: "Southern Cross", country: "澳大利亚", contact: "Emma Clarke", creditLevel: "B", limit: 250_000, used: 46_200, tz: "Australia/Sydney", sales: "Sunny", note: "澳洲检疫要求熏蒸证明，木托必须处理。" },
    { code: "C-SA-001", name: "Al Khuzama", country: "沙特", contact: "Faisal Al-Otaibi", creditLevel: "C", limit: 150_000, used: 29_790, tz: "Asia/Riyadh", sales: "Summer", note: "需要 SASO 认证，斋月期间沟通会变慢。" },
    { code: "C-CA-001", name: "NorthGate Supply", country: "加拿大", contact: "Olivia Tremblay", creditLevel: "B", limit: 200_000, used: 33_900, tz: "America/Toronto", sales: "Ada", note: "新客户，前两单走空运试单。" },
    { code: "C-RO-001", name: "Carpathia Med", country: "罗马尼亚", contact: "Andrei Popescu", creditLevel: "B", limit: 180_000, used: 52_100, tz: "Europe/Bucharest", sales: "Sunny", note: "走 FOB 武汉，指定货代联系不太及时。" },
    { code: "C-KR-001", name: "Hanil Medical", country: "韩国", contact: "Ji-woo Park", creditLevel: "A", limit: 220_000, used: 61_400, tz: "Asia/Seoul", sales: "Sophie", note: "需要正本 FORM K，报关资料要提前一周确认。" },
    { code: "C-CL-001", name: "Cono Sur SpA", country: "智利", contact: "Matías Fuentes", creditLevel: "B", limit: 160_000, used: 24_600, tz: "America/Santiago", sales: "Summer", note: "对唛头很讲究，改版要重新确认。" },
    { code: "C-GB-001", name: "Albion Safety Ltd", country: "英国", contact: "Harry Whitfield", creditLevel: "B", limit: 200_000, used: 38_500, tz: "Europe/London", sales: "Sophie", note: "DDP 条款，英国这端清关由我方安排。" },
  ];
  const customers = await Promise.all(
    customerSeed.map((c) =>
      db.customer.create({
        data: {
          code: c.code, name: c.name, country: c.country, contact: c.contact,
          creditLevel: c.creditLevel, sinosureLimitCents: usd(c.limit), sinosureUsedCents: usd(c.used),
          timezone: c.tz, note: c.note, salesId: by(c.sales).id,
        },
      }),
    ),
  );
  const cus = (name: string) => customers.find((c) => c.name === name)!;

  // ---------- PI + 订单核算 ----------
  const piSeed = [
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
  const pis = await Promise.all(
    piSeed.map((p) =>
      db.pi.create({
        data: {
          piNo: p.no, customerId: cus(p.cus).id, salesId: by(p.sales).id,
          sellerEntityId: p.entity.id, signedOn: day(p.signed), amountCents: usd(p.amt),
          product: p.prod, destination: cus(p.cus).country,
          status: p.settled ? "closed" : "open",
          costing: {
            create: {
              purchaseCostCents: yuan(p.cost), receivableCents: usd(p.ar), payableCents: yuan(p.ap),
              freightCents: yuan(p.amt * 0.42 * 6.7), customsCents: yuan(p.amt * 0.12 * 6.7),
              bankCents: yuan(p.amt * 0.08 * 6.7), profitRateBp: p.bp,
              costEstimated: p.est, settleState: p.settled ? "已完结" : "未完结",
              reviewState: p.bp < 0 ? "pending_review" : "draft",
            },
          },
        },
      }),
    ),
  );
  const pi = (no: string) => pis.find((p) => p.piNo === no)!;

  // ---------- 出运批次 + 里程碑 + 动态 ----------
  type MS = [kind: string, planned: string | null, actual: string | null];
  const shipmentSeed: Array<{
    no: string; label?: string; pi: string; country: string; term: string; mode?: string;
    fcl: boolean; cn?: string; carrier?: string; pod?: string; rel: string; sales: string;
    team: string; note?: string; noteOn?: string; todo?: boolean; ms: MS[];
  }> = [
    { no: "MT26X04118-4", label: "第4批", pi: "MT26X04118", country: "美国", term: "FOB-SH", fcl: true, cn: "TCNU4968789", carrier: "ONE", pod: "洛杉矶", rel: "已放行", sales: "Ada", team: "PPE组", note: "待客户付尾款后电放", noteOn: "2026-08-05", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-07-19", "2026-07-19"], ["ATD", "2026-08-02", "2026-08-02"], ["ETA", "2026-08-21", null]] },
    { no: "MT26X06203-1", pi: "MT26X06203", country: "德国", term: "DDU", fcl: true, cn: "CAJU5340821", carrier: "ONE", pod: "汉堡", rel: "已放行", sales: "Sophie", team: "PPE组", note: "待收 BL COPY，此票开船后需要找货代确认 ETA", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-08-01", "2026-08-01"], ["ATD", "2026-08-09", null], ["ETA", null, null]] },
    { no: "MT26X04119-1", pi: "MT26X04119", country: "澳大利亚", term: "FOB-WH", fcl: true, cn: "TSSU5067819", carrier: "TSL", pod: "BRISBANE", rel: "已放行", sales: "Sunny", team: "PPE组", note: "尾款已收 + 文件已确认，待沟通好费用问题即可放单", noteOn: "2026-08-04", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-08-02", "2026-08-02"], ["ATD", "2026-08-04", "2026-08-04"], ["ETA", "2026-09-11", null]] },
    { no: "MT26X05144-1", label: "第1批", pi: "MT26X05144", country: "罗马尼亚", term: "FOB-WH", fcl: false, rel: "未放行", sales: "Sunny", team: "PPE组", note: "待 7 号上午找指代拿放箱令", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-08-01", "2026-08-01"], ["装柜", "2026-08-10", null], ["进仓", null, null], ["ATD", null, null], ["ETA", null, null]] },
    { no: "MT26X05132-1", pi: "MT26X05132", country: "沙特", term: "FOB-GZ", fcl: true, cn: "PCIU9185538", carrier: "PIL", pod: "吉达", rel: "已放行", sales: "Summer", team: "CCTV组", note: "SC 已出，尾款到账后电放", noteOn: "2026-07-22", ms: [["交期", "2026-07-09", "2026-07-09"], ["装柜", "2026-07-10", "2026-07-10"], ["ATD", "2026-07-21", "2026-07-21"], ["ETA", "2026-08-13", null]] },
    { no: "MT26X04118-5", label: "第5批", pi: "MT26X04118", country: "美国", term: "FOB-SH", fcl: true, cn: "SMCU1019790", carrier: "SML", pod: "洛杉矶", rel: "已放行", sales: "Ada", team: "PPE组", note: "待客户确认清关资料 + 付尾款", noteOn: "2026-08-06", ms: [["交期", "2026-07-31", "2026-07-31"], ["装柜", "2026-07-23", "2026-07-23"], ["ATD", "2026-08-06", "2026-08-06"], ["ETA", "2026-08-23", null]] },
    { no: "MT26X05151-1", pi: "MT26X05151", country: "韩国", term: "FOB-WH", fcl: true, cn: "TBJU7316640", carrier: "SIT", pod: "仁川", rel: "待报关", sales: "Sophie", team: "PPE组", note: "待柜子到厦门后报关；待船开后拿到 BL COPY 申请正本 FORM K + 电放", noteOn: "2026-08-05", todo: true, ms: [["交期", "2026-08-05", "2026-08-05"], ["装柜", "2026-08-05", null], ["ATD", "2026-08-07", null], ["ETA", null, null]] },
    { no: "MT26X06188-1", pi: "MT26X06188", country: "秘鲁", term: "CIF", fcl: false, pod: "卡亚俄", rel: "未放行", sales: "Sophie", team: "PPE组", note: "工厂说面料还没到，已催 3 次没有明确交期", noteOn: "2026-07-28", todo: true, ms: [["交期", "2026-07-28", null], ["装柜", null, null], ["进仓", null, null], ["ATD", null, null], ["ETA", null, null]] },
    { no: "MT26X07235-1", pi: "MT26X07235", country: "加拿大", term: "FOB-SZ", mode: "空运", fcl: true, cn: "AWB 297-88451203", carrier: "CX", pod: "多伦多", rel: "已放行", sales: "Ada", team: "CCTV组", note: "已交空运公司，等 AWB 号", noteOn: "2026-08-05", ms: [["交期", "2026-08-03", "2026-08-03"], ["装柜", "2026-08-04", "2026-08-04"], ["ATD", "2026-08-05", "2026-08-05"], ["ETA", "2026-08-07", null]] },
    { no: "MT26X05144-2", label: "第2批", pi: "MT26X05144", country: "罗马尼亚", term: "FOB-WH", fcl: true, pod: "康斯坦察", rel: "未放行", sales: "Sunny", team: "PPE组", ms: [["交期", "2026-08-18", null], ["装柜", null, null], ["ATD", null, null], ["ETA", null, null]] },
    { no: "MT26X06190-1", pi: "MT26X06190", country: "智利", term: "FOB-SH", fcl: true, cn: "MSCU7712004", carrier: "MSC", pod: "圣安东尼奥", rel: "已放行", sales: "Summer", team: "CCTV组", note: "客户要求改唛头，已让工厂重新印刷", noteOn: "2026-07-25", todo: true, ms: [["交期", "2026-07-20", "2026-07-20"], ["装柜", "2026-07-25", "2026-07-25"], ["ATD", "2026-07-29", "2026-07-29"], ["ETA", "2026-09-02", null]] },
    { no: "MT26X04120-1", pi: "MT26X04120", country: "英国", term: "DDP", fcl: false, cn: "拼柜 · 待配柜", carrier: "COSCO", pod: "费利克斯托", rel: "待报关", sales: "Sophie", team: "PPE组", note: "并柜方还差一家没进仓，货代说最晚 8 号截仓", noteOn: "2026-08-04", todo: true, ms: [["交期", "2026-07-30", "2026-07-30"], ["装柜", "2026-08-04", "2026-08-04"], ["进仓", "2026-08-08", null], ["ATD", null, null], ["ETA", null, null]] },
  ];

  for (const s of shipmentSeed) {
    await db.shipment.create({
      data: {
        batchNo: s.no, batchLabel: s.label, piId: pi(s.pi).id, country: s.country, term: s.term,
        mode: s.mode ?? "海运", fcl: s.fcl, containerNo: s.cn, carrier: s.carrier, pod: s.pod,
        releaseState: s.rel, salesId: by(s.sales).id, team: s.team,
        latestNote: s.note, latestNoteOn: s.noteOn ? day(s.noteOn) : undefined,
        hasTodo: s.todo ?? false,
        milestones: {
          create: s.ms.map(([kind, planned, actual], i) => ({
            kind, seq: i,
            plannedOn: planned ? day(planned) : undefined,
            actualOn: actual ? day(actual) : undefined,
          })),
        },
        notes: s.note
          ? {
              create: [
                { body: s.note, happenedOn: day(s.noteOn!), authorId: by(s.sales).id },
                { body: "货代回复截关时间，已同步工厂", happenedOn: day("2026-08-02"), authorId: by(s.sales).id },
                { body: "工厂确认交期，安排订舱", happenedOn: day("2026-07-26"), authorId: by(s.sales).id },
              ],
            }
          : undefined,
      },
    });
  }

  // ---------- 退税发票 ----------
  const taxSeed = [
    { m: "2026-07", buyer: "魏巍", pi: null, seller: "泉州黑鹰威视电子科技有限公司", inv: "12354076", item: "公共安全设备*监控摄像机", qty: 1500, gross: 140_250, net: 124_115.04, tax: 16_134.96, exp: "2026-07-10", cn: "531620260002305", usd: 19_845, ent: supply, link: "MT26X07235" },
    { m: "2026-07", buyer: "黄媛媛", seller: "厦门安洁无纺制品有限公司", inv: "07788312", item: "纺织产品*ALKHUZAMA 牌一次性医用口罩", qty: 320_200, gross: 195_510, net: 173_017.7, tax: 22_492.3, exp: "2026-07-22", cn: "471420260001204", usd: 29_790, ent: xiaoxing, link: "MT26X05132" },
    { m: "2026-07", buyer: "黄媛媛", seller: "江苏正阳防护用品有限公司", inv: "35660411", item: "纺织产品*一次性隔离衣", qty: 70_200, gross: 83_300, net: 73_716.81, tax: 9_583.19, exp: "2026-07-09", cn: "471420260000873", usd: 11_640.5, ent: xiaoxing, link: "MT26X06188" },
    { m: "2026-07", buyer: "黄媛媛", seller: "浙江宏达医疗器械有限公司", inv: "29734121", item: "纺织产品*一次性医用口罩", qty: 366_000, gross: 26_352, net: 23_320.35, tax: 3_031.65, exp: "2026-07-06", cn: "471420260000664", usd: 4_113.71, ent: xiaoxing, link: null },
    { m: "2026-07", buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29775830", item: "纺织产品*一次性手术衣", qty: 90_000, gross: 23_760, net: 21_026.55, tax: 2_733.45, exp: "2026-07-07", cn: "471420260000665", usd: 3_007.35, ent: xiaoxing, link: null },
    { m: "2026-07", buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29774271", item: "纺织产品*一次性帽子", qty: 154_000, gross: 9_240, net: 8_176.99, tax: 1_063.01, exp: "2026-07-09", cn: "471420260000666", usd: 1_294.71, ent: xiaoxing, link: "MT26X05144" },
    { m: "2026-07", buyer: "黄媛媛", seller: "湖北康泰无纺布制品有限公司", inv: "29775671", item: "纺织产品*一次性防护服", qty: 18_200, gross: 31_000, net: 27_433.63, tax: 3_566.37, exp: "2026-07-09", cn: "471420260000667", usd: 16_648.01, ent: xiaoxing, link: "MT26X05144" },
    { m: "2026-07", buyer: "黄媛媛", seller: "江苏正阳防护用品有限公司", inv: "29775758", item: "纺织产品*一次性袖套", qty: 86_000, gross: 8_240, net: 7_292.04, tax: 947.96, exp: "2026-07-09", cn: "471420260000668", usd: 1_305.88, ent: supply, link: "MT26X04120" },
    { m: "2026-07", buyer: "林珊", seller: "湖北真诚无纺布制品有限公司", inv: "29775831", item: "纺织产品*一次性鞋套", qty: 300_000, gross: 29_800, net: 26_371.68, tax: 3_428.32, exp: "2026-07-09", cn: "471420260000669", usd: 0, ent: supply, link: "MT26X04120" },
    { m: "2026-07", buyer: "林珊", seller: "湖北真诚无纺布制品有限公司", inv: "29775832", item: "纺织产品*一次性实验服", qty: 25_000, gross: 55_500, net: 49_115.04, tax: 6_384.96, exp: "2026-07-09", cn: "471420260000670", usd: 7_420.4, ent: supply, link: null },
    { m: "2026-06", buyer: "黄媛媛", seller: "厦门安洁无纺制品有限公司", inv: "29661204", item: "纺织产品*一次性防护服", qty: 80_000, gross: 268_400, net: 237_522.12, tax: 30_877.88, exp: "2026-06-24", cn: "471420260000512", usd: 40_100, ent: xiaoxing, link: "MT26X04118" },
    { m: "2026-06", buyer: "魏巍", seller: "泉州黑鹰威视电子科技有限公司", inv: "29660881", item: "公共安全设备*监控摄像机", qty: 800, gross: 96_300, net: 85_221.24, tax: 11_078.76, exp: "2026-06-28", cn: "531620260002104", usd: 14_320, ent: supply, link: "MT26X06190" },
  ];
  for (const t of taxSeed) {
    await db.taxInvoice.create({
      data: {
        declareMonth: t.m, buyer: t.buyer, sellerName: t.seller, invoiceNo: t.inv, item: t.item,
        qty: t.qty, grossCents: yuan(t.gross), netCents: yuan(t.net), taxCents: yuan(t.tax),
        exportedOn: day(t.exp), customsNo: t.cn, customsUsdCents: usd(t.usd),
        sellerEntityId: t.ent.id, piId: t.link ? pi(t.link).id : null,
      },
    });
  }

  const counts = {
    用户: await db.user.count(), 客户: await db.customer.count(), PI: await db.pi.count(),
    出运批次: await db.shipment.count(), 里程碑: await db.shipmentMilestone.count(),
    动态: await db.shipmentNote.count(), 退税发票: await db.taxInvoice.count(),
  };
  console.log("演示数据已写入：", counts);
  console.log("登录：admin / demo1234（其余账号密码相同）");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

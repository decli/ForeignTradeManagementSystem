/**
 * 售前演示数据：询盘 / 报价 / 样品。
 *
 * 这一段的数据分布是**照真实漏斗形状**给的，不是均匀随机：
 *   · 询盘里有相当一部分是没人回的 —— 那正是这个模块要暴露的问题；
 *   · 报价里超过一半停在"已发出"没有下文，这是外贸的常态；
 *   · 议价（同一个报价号的多个版本）只发生在少数几单上，
 *     但那几单是最值得看的：让价轨迹一列排开，才看得出这单是怎么谈下来的。
 *
 * 数据不好看，但真实。一个每条询盘都按时回、每张报价都成交的演示账套，
 * 恰恰演示不出这个系统有什么用。
 */

import type { Database } from "./types";
import type { Inquiry, PresalesData, QuoteCalcInput, QuoteLine, Quotation, SampleOrder } from "./presales-types";
import { INQUIRY_SOURCES, LOST_REASONS } from "./presales-types";
import { PRODUCT_SEED } from "./catalog";

const DAY = 86_400_000;
const HOUR = 3_600_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 还没建档的潜客。询盘阶段大部分是这种 —— 建档要等成交 */
const PROSPECTS = [
  { company: "Nordic Care AB", country: "瑞典", contact: "Erik Lindqvist", email: "erik@nordiccare.se" },
  { company: "Baltic MedSupply UAB", country: "立陶宛", contact: "Ruta Jankauskas", email: "r.jankauskas@balticmed.lt" },
  { company: "Sahara Trading LLC", country: "埃及", contact: "Amr Fathy", email: "amr@saharatrd.com.eg" },
  { company: "Pampas Salud SRL", country: "阿根廷", contact: "Lucía Gómez", email: "lgomez@pampassalud.com.ar" },
  { company: "Aegean Medikal", country: "希腊", contact: "Nikos Papadakis", email: "nikos@aegeanmed.gr" },
  { company: "Kilimanjaro Health Ltd", country: "肯尼亚", contact: "Grace Wanjiru", email: "g.wanjiru@kilihealth.co.ke" },
  { company: "Sunbelt Safety Supply", country: "美国", contact: "Brian Whitaker", email: "bwhitaker@sunbeltsafety.com" },
  { company: "Helvetia Schutz AG", country: "瑞士", contact: "Marc Brunner", email: "m.brunner@helvetiaschutz.ch" },
  { company: "Dhaka Medical Import", country: "孟加拉国", contact: "Rahim Chowdhury", email: "rahim@dhakamedimp.com" },
  { company: "Pacifico Andino EIRL", country: "厄瓜多尔", contact: "Sofía Cedeño", email: "scedeno@pacificoandino.ec" },
  { company: "Levant Supplies Co.", country: "约旦", contact: "Hala Mansour", email: "hala@levantsupplies.jo" },
  { company: "Maple Ridge Distribution", country: "加拿大", contact: "Ethan Boucher", email: "ethan@mapleridgedist.ca" },
];

/**
 * 客户原话。这些句子是询盘列表里唯一能让人一眼判断"值不值得跟"的东西。
 *
 * 每条绑一个 SKU —— 原话说"3000 台摄像机"、旁边意向产品却写着"丁腈手套"，
 * 一眼就看出这是随机拼的假数据。演示数据可以是编的，但不能自相矛盾。
 */
const DEMANDS: Array<{ text: string; sku: string }> = [
  { sku: "MSK-SUR-3P", text: "Need 200,000 pcs surgical masks, CE marked, delivered to Rotterdam. Please quote CIF and lead time." },
  { sku: "GLV-NIT-M", text: "We are looking for a long-term supplier of nitrile gloves. Monthly 500,000 pcs. What is your best FOB price?" },
  { sku: "PPE-ISO-BLU", text: "Please send price for isolation gowns AAMI Level 2, 50,000 pcs, and confirm you can print our logo." },
  { sku: "CCTV-BUL", text: "Urgent: need 3,000 IP cameras before end of quarter. Do you have stock?" },
  { sku: "PPE-COV-L", text: "Quote for coveralls Type 5/6, size L and XL mixed, 20,000 pcs, DDP Hamburg please." },
  { sku: "MSK-SUR-3P", text: "我们是国内贸易商，客户在中东，需要报 FOB 厦门，口罩 100 万只，含 SASO 认证。" },
  { sku: "MSK-N95", text: "Do you supply N95 with NIOSH approval? We need 80,000 pcs for a government tender, closing in 3 weeks." },
  { sku: "PPE-FSH", text: "Sample request first, then bulk order of face shields. Please advise sample cost and courier." },
  { sku: "MED-THM", text: "Interested in your thermometers. Need FDA registration documents before we can proceed." },
  { sku: "PPE-SHC", text: "Looking for shoe covers and caps, container load, CIF Callao. Payment by L/C at sight acceptable?" },
  { sku: "PPE-SRG", text: "Repeat order, same specs as last time but quantity doubled. Can you hold the same price?" },
  { sku: "MSK-SUR-3P", text: "We need EUR pricing, our budget is around 0.055 EUR per mask. Is that workable?" },
  { sku: "CCTV-NVR", text: "We need 900 NVRs with 4TB drives pre-installed. Please confirm the export declaration for the batteries." },
  { sku: "PPE-CAP", text: "Disposable caps, 500,000 pcs, private label. Send your MOQ and artwork requirements." },
];

/** 让价理由，按第几轮排。方向都跟降价一致 —— 谈判是一路往下走的 */
const REVISE_REASONS = [
  "客户嫌贵，先让 3 个点争取把量锁住",
  "同行报了更低的价，客户拿去比了；这是最后一次让价",
  "客户把数量翻倍，按阶梯价重报",
];

export function buildPresalesSeed(db: Database): PresalesData {
  const rand = mulberry32(20260808);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  let n = 0;
  const id = (p: string) => `${p}_${(++n).toString(36).padStart(4, "0")}`;

  const sales = db.users.filter((u) => u.role === "sales" && u.active);
  const products = db.ops.products;
  const sellOf = (sku: string) => PRODUCT_SEED.find((p) => p.sku === sku)?.sellE4 ?? 10_000;
  const marketRate = db.fxRates.find((r) => r.kind === "market")?.rateE6 ?? 6_739_200;
  const year = new Date().getFullYear().toString().slice(2);

  /* ═══════════ 询盘 ═══════════ */
  const inquiries: Inquiry[] = [];

  /**
   * 一条询盘。
   *
   * `hoursAgo` 决定它有多老，`repliedAfter` 决定回没回、隔多久回的 ——
   * 这两个数一起决定了 SLA 那一列显示什么。故意留了一批 `repliedAfter: null`
   * 且已经放了一两天的：那是这个页面存在的理由。
   */
  const addInquiry = (o: {
    hoursAgo: number;
    repliedAfter: number | null;
    status: string;
    fromCustomer?: boolean;
    lost?: string;
  }) => {
    const useCustomer = o.fromCustomer ?? rand() < 0.32;
    const cust = useCustomer ? pick(db.customers) : null;
    const pros = cust ? null : PROSPECTS[inquiries.length % PROSPECTS.length];
    const receivedMs = nowMs - o.hoursAgo * HOUR;
    const owner = cust ? db.users.find((u) => u.id === cust.salesId) ?? pick(sales) : pick(sales);
    const demand = pick(DEMANDS);
    /* 意向产品由原话决定，不另外随机 —— 两边对不上一眼就看得出是假数据。
       两成的询盘故意留空：现实里客户经常只说"你们做口罩吗"，
       而"未指明产品"恰恰是业务员要去追问的信号。 */
    const prd = rand() < 0.8 ? products.find((p) => p.sku === demand.sku) ?? pick(products) : null;
    const replied = o.repliedAfter === null ? null : receivedMs + o.repliedAfter * HOUR;

    inquiries.push({
      id: id("inq"),
      inquiryNo: `INQ${year}${String(1000 + inquiries.length)}`,
      customerId: cust?.id ?? null,
      company: cust?.name ?? pros!.company,
      country: cust?.country ?? pros!.country,
      contactName: cust?.contact ?? pros!.contact,
      email: cust ? null : pros!.email,
      im: rand() < 0.3 ? "WhatsApp" : null,
      source: cust ? (rand() < 0.7 ? "老客户复购" : "客户介绍") : pick(INQUIRY_SOURCES.filter((s) => s !== "老客户复购")),
      demand: demand.text,
      productId: prd?.id ?? null,
      qty: prd ? Math.round(between(5_000, 400_000) / 1000) * 1000 : null,
      unit: prd?.unit ?? "pcs",
      // 客户自报的心理价压在标准报价的 78%~96% —— 客户永远先砍一刀
      targetPriceCents: prd ? Math.round((sellOf(prd.sku) / 100) * between(0.78, 0.96)) : 0,
      status: o.status,
      lostReason: o.status === "lost" ? (o.lost ?? pick(LOST_REASONS)) : null,
      ownerId: owner?.id ?? null,
      receivedAt: iso(receivedMs),
      firstReplyAt: replied ? iso(replied) : null,
      lastTouchAt: replied ? iso(Math.min(nowMs, replied + between(0, 72) * HOUR)) : null,
      nextFollowOn: o.status === "working" || o.status === "quoted" ? isoDay(nowMs + Math.round(between(-2, 6)) * DAY) : null,
      note: null,
      createdAt: iso(receivedMs),
    });
    return inquiries[inquiries.length - 1];
  };

  // 超时未回的：这一批撑起「首次响应」那块 KPI
  addInquiry({ hoursAgo: 41, repliedAfter: null, status: "new" });
  addInquiry({ hoursAgo: 30, repliedAfter: null, status: "new" });
  addInquiry({ hoursAgo: 26, repliedAfter: null, status: "new" });
  // 快到线了但还没超
  addInquiry({ hoursAgo: 15, repliedAfter: null, status: "new" });
  addInquiry({ hoursAgo: 13, repliedAfter: null, status: "new" });
  // 刚进来，还很安全
  addInquiry({ hoursAgo: 3, repliedAfter: null, status: "new" });
  addInquiry({ hoursAgo: 1, repliedAfter: null, status: "new" });

  for (let i = 0; i < 9; i++) addInquiry({ hoursAgo: Math.round(between(24, 340)), repliedAfter: between(0.4, 9), status: "working" });
  for (let i = 0; i < 8; i++) addInquiry({ hoursAgo: Math.round(between(60, 620)), repliedAfter: between(0.5, 16), status: "quoted" });
  for (let i = 0; i < 5; i++) addInquiry({ hoursAgo: Math.round(between(200, 900)), repliedAfter: between(0.3, 6), status: "won", fromCustomer: true });
  addInquiry({ hoursAgo: 380, repliedAfter: 2.5, status: "lost", lost: "价格太高" });
  addInquiry({ hoursAgo: 520, repliedAfter: 30, status: "lost", lost: "被同行截胡" });
  addInquiry({ hoursAgo: 610, repliedAfter: 1.2, status: "lost", lost: "起订量谈不拢" });
  addInquiry({ hoursAgo: 700, repliedAfter: 4, status: "lost", lost: "认证/资质不符" });
  addInquiry({ hoursAgo: 840, repliedAfter: null, status: "lost", lost: "失联" });

  /* ═══════════ 报价单 ═══════════ */
  const quotes: Quotation[] = [];
  const quoteLines: QuoteLine[] = [];

  const PAY_TERMS = [
    "30% T/T 定金，70% 见提单副本",
    "100% T/T 发货前",
    "L/C at sight，即期信用证",
    "30% 定金，70% 见提单副本 30 天",
    "D/P at sight",
  ];
  const PORTS: Record<string, string> = {
    美国: "Los Angeles", 加拿大: "Vancouver", 德国: "Hamburg", 法国: "Le Havre", 英国: "Felixstowe",
    荷兰: "Rotterdam", 意大利: "Genoa", 西班牙: "Valencia", 波兰: "Gdansk", 罗马尼亚: "Constanta",
    土耳其: "Istanbul", 澳大利亚: "Sydney", 韩国: "Busan", 日本: "Yokohama", 新加坡: "Singapore",
    越南: "Hai Phong", 印度: "Nhava Sheva", 沙特: "Jeddah", 阿联酋: "Jebel Ali", 南非: "Durban",
    巴西: "Santos", 墨西哥: "Manzanillo", 智利: "San Antonio", 秘鲁: "Callao", 瑞典: "Gothenburg",
    立陶宛: "Klaipeda", 埃及: "Alexandria", 阿根廷: "Buenos Aires", 希腊: "Piraeus", 肯尼亚: "Mombasa",
    瑞士: "Basel", 孟加拉国: "Chittagong", 厄瓜多尔: "Guayaquil", 约旦: "Aqaba",
  };

  /**
   * 一张报价单的明细行。1–3 行，跟 PI 明细行同构。
   *
   * ── 数量由"这单值多少钱"倒推，不能独立随机 ──
   * 先随一个订单金额（$8k–$180k，外贸中小单的真实区间），再用单价除出数量。
   * 反过来做（先随数量再乘单价）会给出 26 万台硬盘录像机这种单子 ——
   * 单价 $635 × 26 万 = 一亿六千万美元，一眼假。
   */
  type LineSpec = { prd: (typeof products)[number]; sellE4: number; qty: number; costE4: number };

  /**
   * 一张报价单要卖的东西。**每个报价号只算一次**，所有版本共用。
   *
   * ── 为什么不能每版重新生成 ──
   * 早先每开一版都重新随机产品和数量，结果同一个报价号的三个版本
   * 利润率是 23% → 29% → 32%：越让价越赚。议价轨迹的全部意义就在于
   * "同一批货，价格一路降"，货都换了，那条轨迹就是三条互不相干的线。
   */
  const specOf = (count: number): LineSpec[] => {
    const chosen: typeof products = [];
    for (let i = 0; i < count; i++) {
      const p = pick(products.filter((x) => !chosen.includes(x)));
      if (p) chosen.push(p);
    }
    const orderUsd = between(8_000, 180_000);
    const weights = chosen.map((_, i) => (i === 0 ? 1 : between(0.15, 0.4)));
    const wSum = weights.reduce((a, b) => a + b, 0);
    return chosen.map((prd, i) => {
      const sellE4 = PRODUCT_SEED.find((x) => x.name === prd.name)?.sellE4 ?? 10_000;
      const shareUsd = (orderUsd * weights[i]) / wSum;
      // 数量取 100 的倍数：行金额 = qty × E4 / 100，整除才不会有尾差
      const qty = Math.max(100, Math.round((shareUsd * 10_000) / sellE4 / 100) * 100);
      return { prd, sellE4, qty, costE4: Math.round(prd.lastCostCents * 100 * between(0.95, 1.05)) };
    });
  };

  /** 按某一版的价格系数落成明细行。货和量都不动，只有单价变 */
  const addLines = (quoteId: string, spec: LineSpec[], discount: number) =>
    spec.map((s, i) => {
      const line: QuoteLine = {
        id: id("ql"),
        quoteId,
        seq: i + 1,
        productId: s.prd.id,
        name: s.prd.name,
        nameEn: s.prd.nameEn ?? null,
        hsCode: s.prd.hsCode,
        refundRateBp: s.prd.refundRateBp,
        qty: s.qty,
        unit: s.prd.unit,
        unitPriceE4: Math.max(1, Math.round(s.sellE4 * discount)),
        costE4: s.costE4,
        packQty: s.prd.packQty,
        grossWeightG: s.prd.grossWeightG,
        volumeCm3: s.prd.volumeCm3,
        note: null,
      };
      quoteLines.push(line);
      return line;
    });

  /** 海运费和国内费用按**体积**推，不能独立随机 —— 见下面注释 */
  const OCEAN_PER_CBM = 420;
  const LOCAL_PER_CBM = 85;
  const LOCAL_FIXED = 1600;

  /**
   * 核算参数。
   *
   * ── 运费必须由这一单的体积算出来 ──
   * 早先运费是 ¥6,000–¥42,000 独立随机的，结果一张 $2,000 的帽子单配了
   * ¥42,000 的海运费，利润率算出 **−125%**。这不是显示 bug，是数据自相矛盾：
   * 运费在现实中就是体积的函数，随机给等于承认这套核算是摆设。
   * 现在按 ¥420/CBM 推（整柜均摊后的市场价量级），国内段 ¥85/CBM + ¥1600 固定。
   */
  const calcFor = (lines: QuoteLine[]): QuoteCalcInput => {
    const cbm = lines.reduce((s, l) => s + (l.packQty > 0 ? Math.ceil(l.qty / l.packQty) : 0) * l.volumeCm3, 0) / 1_000_000;
    return {
      rateE6: marketRate,
      freightCents: Math.round(cbm * OCEAN_PER_CBM * between(0.85, 1.2) * 100),
      insuranceRateBp: 30,
      localCents: Math.round((LOCAL_FIXED + cbm * LOCAL_PER_CBM) * 100),
      bankRateBp: 110,
      destCents: 0,
      targetMarginBp: 1800,
      refundCounted: true,
    };
  };

  /**
   * 一张报价单（可能带多个版本）。
   *
   * `rounds` 是议价轮数。每多一轮，价格降一点、版本号加一 ——
   * 让价轨迹就是这么攒出来的。前面几版状态是 negotiating，
   * 最后一版才承载最终结果。
   */
  const addQuote = (o: { daysAgo: number; rounds: number; final: string; fromInquiry?: Inquiry; piNo?: string; squeeze?: boolean }) => {
    /* 要转成某张 PI 的报价，客户必须**从那张 PI 反推**。
       早先是随机挑一条询盘当来源，于是出现"德国 Rheinland 的报价转成了给秘鲁客户的 PI"——
       链路视图上一眼就穿帮。指定了 piNo 就以 PI 的客户为准，
       再在这个客户名下找一条询盘挂上；找不到就不挂。 */
    const pi = o.piNo ? db.pis.find((p) => p.piNo === o.piNo) : undefined;
    const piCust = pi ? db.customers.find((c) => c.id === pi.customerId) ?? null : null;
    const inq = piCust
      ? inquiries.find((x) => x.customerId === piCust.id) ?? null
      : (o.fromInquiry ?? pick(inquiries.filter((x) => x.status === "quoted" || x.status === "won")));
    const cust = piCust ?? (inq?.customerId ? db.customers.find((c) => c.id === inq.customerId) ?? null : null);
    const country = cust?.country ?? inq?.country ?? "德国";
    const quoteNo = `QT${year}${String(2000 + quotes.length)}`;
    const incoterm = pick(["FOB", "CIF", "CFR", "DDP"] as const);
    const currency = rand() < 0.16 ? "EUR" : "USD";
    const lineCount = rand() < 0.5 ? 1 : rand() < 0.8 ? 2 : 3;
    const owner = inq?.ownerId ?? pick(sales)?.id ?? null;

    /* 货和量在这里定死，所有版本共用 —— 议价改的只有价格 */
    const spec = specOf(lineCount);
    const open = between(1.0, 1.06);
    /* 让价幅度。squeeze 的那几单是被客户压狠了的，跌到标准价的八成上下，
       利润率会掉到红线以下 —— 那正是"特价审批"这条规则存在的场景，
       演示账套里必须有几张这样的单，否则审批中心是空的 */
    const step = o.squeeze ? between(0.9, 0.93) : between(0.95, 0.98);

    let prevId: string | null = null;
    for (let v = 1; v <= o.rounds; v++) {
      const qid = id("qt");
      const last = v === o.rounds;
      const discount = open * Math.pow(step, v - 1);
      const lines = addLines(qid, spec, discount);
      const createdMs = nowMs - (o.daysAgo - (v - 1) * 4) * DAY;
      quotes.push({
        id: qid,
        quoteNo,
        version: v,
        prevId,
        inquiryId: inq?.id ?? null,
        customerId: cust?.id ?? null,
        company: inq?.company ?? cust?.name ?? "—",
        country,
        contactId: cust ? db.contacts.find((c) => c.customerId === cust.id && c.primary)?.id ?? null : null,
        currency,
        incoterm,
        pol: pick(["Xiamen", "Shenzhen", "Ningbo", "Shanghai"]),
        pod: PORTS[country] ?? "Rotterdam",
        validUntil: isoDay(createdMs + Math.round(between(7, 30)) * DAY),
        leadDays: Math.round(between(18, 45)),
        payTerm: pick(PAY_TERMS),
        status: last ? o.final : "negotiating",
        /* 让价理由按**轮次**给，不随机挑。
           随机挑会出两个毛病：同一张单的 v2 和 v3 抽到同一句话；
           以及抽到"价格相应上调"这种跟实际降价方向相反的理由 ——
           议价轨迹里，理由跟数字对不上比没有理由更糟。 */
        revisionNote: v === 1 ? null : REVISE_REASONS[Math.min(v - 2, REVISE_REASONS.length - 1)],
        piId: last && pi ? pi.id : null,
        ownerId: owner,
        sellerEntityId: db.sellerEntities[0]?.id ?? null,
        calc: incoterm === "DDP" ? { ...calcFor(lines), destCents: Math.round(between(9_000, 26_000) * 100) } : calcFor(lines),
        createdAt: iso(createdMs),
        updatedAt: iso(createdMs),
      });
      /* 转成 PI 的那一版要**双向**挂上：报价上记 piId，PI 上记 quoteId。
         只挂一头的话，一单到底的链路从 PI 往回追不到报价，
         单据也拿不到贸易术语和目的港（会退回默认的 FOB Xiamen）。 */
      if (last && pi) {
        const idx = db.pis.findIndex((p) => p.id === pi.id);
        if (idx >= 0) db.pis[idx] = { ...db.pis[idx], quoteId: qid };
      }
      prevId = qid;
    }
  };

  // 议价三轮谈成的那几单 —— 让价轨迹最值得看
  addQuote({ daysAgo: 26, rounds: 3, final: "converted", piNo: "MT26X06203" });
  addQuote({ daysAgo: 34, rounds: 3, final: "converted", piNo: "MT26X05151" });
  addQuote({ daysAgo: 18, rounds: 2, final: "accepted" });
  // 被压狠了的两单：最后一版跌破 11% 红线，审批中心里那几条特价审批就是它们
  addQuote({ daysAgo: 12, rounds: 3, final: "negotiating", squeeze: true });
  addQuote({ daysAgo: 9, rounds: 2, final: "negotiating", squeeze: true });
  addQuote({ daysAgo: 44, rounds: 3, final: "rejected", squeeze: true });
  // 一版发出去就没下文的 —— 外贸的常态，占大多数
  for (let i = 0; i < 7; i++) addQuote({ daysAgo: Math.round(between(3, 40)), rounds: 1, final: "sent" });
  for (let i = 0; i < 3; i++) addQuote({ daysAgo: Math.round(between(40, 90)), rounds: 1, final: "expired" });
  addQuote({ daysAgo: 2, rounds: 1, final: "draft" });
  addQuote({ daysAgo: 1, rounds: 1, final: "draft" });

  /* ═══════════ 样品单 ═══════════ */
  const samples: SampleOrder[] = [];
  const COURIERS = ["DHL", "FedEx", "UPS", "SF Express"];
  const FEEDBACK = [
    "Quality approved. Please proceed with the quotation for 100,000 pcs.",
    "The fabric feels thinner than the spec sheet says. Can you send an alternative?",
    "Colour is slightly off from Pantone 285C. Everything else is fine.",
    "Received. Our lab test will take another two weeks.",
    "客户反馈耳带弹性不足，戴久了会松，要求换 5mm 宽的。",
  ];

  const addSample = (o: { daysAgo: number; status: string }) => {
    const inq = pick(inquiries);
    const cust = inq.customerId ? db.customers.find((c) => c.id === inq.customerId) ?? null : null;
    const prd = pick(products);
    const reqMs = nowMs - o.daysAgo * DAY;
    const sentMs = o.status === "requested" ? null : reqMs + Math.round(between(1, 4)) * DAY;
    const delivered = o.status === "delivered" || o.status === "feedback" || o.status === "closed";
    const delMs = sentMs && delivered ? sentMs + Math.round(between(3, 9)) * DAY : null;
    samples.push({
      id: id("smp"),
      sampleNo: `SMP${year}${String(300 + samples.length)}`,
      inquiryId: inq.id,
      customerId: cust?.id ?? null,
      company: inq.company,
      country: inq.country,
      productId: prd.id,
      productName: prd.name,
      qty: Math.round(between(2, 40)),
      // 样品费多数是象征性收的，收了在大单里退 —— 免费样容易招骗样的
      feeCents: rand() < 0.35 ? 0 : Math.round(between(20, 180)) * 100,
      freightBy: rand() < 0.55 ? "客户到付" : "我方承担",
      courier: sentMs ? pick(COURIERS) : null,
      trackingNo: sentMs ? `${Math.floor(between(1e9, 9.9e9))}` : null,
      status: o.status,
      requestedOn: isoDay(reqMs),
      sentOn: sentMs ? isoDay(sentMs) : null,
      deliveredOn: delMs ? isoDay(delMs) : null,
      /* 该催的日子 = 客户签收后 5 天。样品寄出去没下文是外贸最常见的漏斗断点，
         这个日期就是防止它断的唯一机制 */
      followOn: delMs ? isoDay(delMs + 5 * DAY) : sentMs ? isoDay(sentMs + 12 * DAY) : null,
      feedback: o.status === "feedback" || o.status === "closed" ? pick(FEEDBACK) : null,
      ownerId: inq.ownerId,
      note: null,
    });
  };

  addSample({ daysAgo: 1, status: "requested" });
  addSample({ daysAgo: 3, status: "requested" });
  addSample({ daysAgo: 6, status: "sent" });
  addSample({ daysAgo: 9, status: "sent" });
  // 早就签收了却一直没反馈的 —— 列表按「该催的日子」排序，这几条会顶在最上面
  addSample({ daysAgo: 22, status: "delivered" });
  addSample({ daysAgo: 31, status: "delivered" });
  addSample({ daysAgo: 17, status: "delivered" });
  addSample({ daysAgo: 26, status: "feedback" });
  addSample({ daysAgo: 38, status: "feedback" });
  addSample({ daysAgo: 52, status: "closed" });
  addSample({ daysAgo: 64, status: "closed" });
  addSample({ daysAgo: 12, status: "sent" });

  return { inquiries, quotes, quoteLines, samples };
}

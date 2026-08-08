/**
 * 出口单据：形式发票 / 商业发票 / 装箱单。
 *
 * ── 为什么这三张 ──
 * 业务员取完 PI 号，要发给客户的是**一份 PDF**，不是系统里的一行记录。
 * 这三张是外贸最基础的一套：PI 用来签约收定金，CI 和 PL 跟着货走清关。
 * 三张都从同一批明细行生成 —— 这正是 `PiLine` 存在的理由。
 *
 * ── 单据语言为什么默认英文 ──
 * 这些纸最终落在客户的采购、他们的清关行、他们的银行手里，那里没人读中文。
 * 界面语言（中/英切换）只影响**你在屏幕上看到的东西**，
 * 不该影响**发出去的单据**——这两件事混在一起，会出现"业务员把界面切成中文，
 * 发给德国客户的发票就变成中文了"这种事故。所以单据语言是独立的一个开关，
 * 默认英文，另有一档「中英对照」给内部复核用。
 *
 * ── 金额大写 ──
 * 商业发票要求金额大写（SAY TOTAL ...），这是清关和银行审单要看的。
 * 少了它有些国家的清关行会退单。
 */

import type { Attachment, Customer, Database, Pi, PiLine, SellerEntity } from "@/data/types";
import { lineAmount, lineCartons } from "@/data/types";
import type { Contact } from "@/data/types";
import { batchInvoiceNo, resolveShipLines } from "@/data/shipment-lines";
import { countryEn } from "@/lib/geo";

export type DocKind = "PI" | "CI" | "PL";

/**
 * 计量单位的英文。
 *
 * 单据上不能出现"台""只""双"—— 跟中文国名一个道理，对方清关行读不懂。
 * 查不到就原样返回：宁可留一个中文单位，也不要留空。
 */
const UNIT_EN: Record<string, string> = {
  件: "pcs", 只: "pcs", 个: "pcs", 台: "sets", 套: "sets", 双: "pairs", 支: "pcs",
  张: "pcs", 箱: "ctns", 千克: "kg", 公斤: "kg", 米: "m", 卷: "rolls", 包: "bags",
};
export const unitEn = (u: string) => UNIT_EN[u] ?? u;

export const DOC_TITLES: Record<DocKind, { en: string; zh: string }> = {
  PI: { en: "PROFORMA INVOICE", zh: "形式发票" },
  CI: { en: "COMMERCIAL INVOICE", zh: "商业发票" },
  PL: { en: "PACKING LIST", zh: "装箱单" },
};

export type DocLang = "en" | "both";

export type DocLine = {
  seq: number;
  desc: string;
  hsCode: string | null;
  qty: number;
  unit: string;
  /** 单价，报价币种，已经是可显示的小数 */
  price: number;
  /** 金额，分 */
  amountCents: number;
  cartons: number;
  netKg: number;
  grossKg: number;
  cbm: number;
};

export type DocModel = {
  kind: DocKind;
  no: string;
  date: string;
  seller: SellerEntity;
  buyer: Customer | null;
  buyerContact: Contact | null;
  /** 买方国家的英文名。单据上不能出现中文国名，见 lib/geo.ts */
  buyerCountryEn: string;
  currency: string;
  incoterm: string;
  pol: string;
  pod: string;
  payTerm: string;
  /** 唛头。自定义字段里填的 */
  marks: string;
  lines: DocLine[];
  totalCents: number;
  totalQty: number;
  totalCartons: number;
  totalNetKg: number;
  totalGrossKg: number;
  totalCbm: number;
  /** 贸易术语后面该跟哪个地名，见 termPlace() */
  termLine: string;
};

/** 毛重减 8% 当净重。真实系统里净重该单独填，这里给一个业内常用的估算并标明 */
const NET_RATIO = 0.92;

/**
 * 生成一张单据。
 *
 * ── shipmentId：这张单是给整票货开的，还是给某一批开的 ──
 * 不传 = 按整张 PI 出，跟以前完全一样（一次出完的单子就该这样）。
 * 传了 = CI / PL 按**这一批实际装的货**出。
 *
 * 这是这个函数存在过的最大的错：一张 PI 分 4 批出运，给第 4 批开装箱单，
 * 打出来的是整张 PI 的 8 万件和总箱数 —— 柜号对、数量错，而那张纸是要
 * 拿去清关的。PI 本身永远是整票的（它是合同，不随出运拆分）。
 */
export function buildDoc(db: Database, pi: Pi, kind: DocKind, shipmentId?: string | null): DocModel | null {
  const seller = db.sellerEntities.find((e) => e.id === pi.sellerEntityId) ?? db.sellerEntities[0];
  if (!seller) return null;
  const buyer = db.customers.find((c) => c.id === pi.customerId) ?? null;
  const contact = buyer ? db.contacts.find((c) => c.customerId === buyer.id && c.primary) ?? null : null;
  const quote = pi.quoteId ? db.presales.quotes.find((q) => q.id === pi.quoteId) : undefined;

  // PI 是合同，永远整票；CI/PL 跟着货走，指定了批次就只出这一批
  const batch = kind === "PI" || !shipmentId ? null : (db.shipments.find((s) => s.id === shipmentId) ?? null);
  const batchLines = batch ? resolveShipLines(db, batch.id) : null;

  const lines: DocLine[] = batchLines
    ? batchLines.map((r, i) => ({
        seq: i + 1,
        desc: r.piLine.nameEn || r.piLine.name,
        hsCode: r.piLine.hsCode,
        qty: r.qty,
        unit: unitEn(r.piLine.unit),
        price: r.piLine.unitPriceE4 / 10_000,
        // 单价照旧、数量按本批 —— 金额必须由这两者算出，不能拿整票金额分摊
        amountCents: Math.round((r.qty * r.piLine.unitPriceE4) / 100),
        cartons: r.cartons,
        netKg: r.grossKg * NET_RATIO,
        grossKg: r.grossKg,
        cbm: r.cbm,
      }))
    : db.piLines
        .filter((l) => l.piId === pi.id)
        .sort((a, b) => a.seq - b.seq)
        .map((l: PiLine): DocLine => {
          const cartons = lineCartons(l);
          const grossKg = (cartons * l.grossWeightG) / 1000;
          return {
            seq: l.seq,
            desc: l.nameEn || l.name,
            hsCode: l.hsCode,
            qty: l.qty,
            unit: unitEn(l.unit),
            price: l.unitPriceE4 / 10_000,
            amountCents: lineAmount(l),
            cartons,
            netKg: grossKg * NET_RATIO,
            grossKg,
            cbm: (cartons * l.volumeCm3) / 1_000_000,
          };
        });

  const sum = <K extends keyof DocLine>(k: K) => lines.reduce((s, l) => s + (l[k] as number), 0);

  return {
    kind,
    /* 单据号从 PI 号派生，不另起一套流水 —— 客户和清关行是靠这个号把
       PI、发票、装箱单、报关单串起来的，三张纸各有各的号只会让人对不上。
       分批时用批次自己的号（MT26X04118-4-CI）：4 批共用一个发票号，
       客户财务和清关行都对不上是哪一票货。 */
    no: kind === "PI" ? pi.piNo : batch ? `${batchInvoiceNo(batch)}-${kind}` : `${pi.piNo}-${kind}`,
    date: kind === "PI" ? pi.signedOn ?? pi.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    seller,
    buyer,
    buyerContact: contact,
    buyerCountryEn: countryEn(buyer?.country),
    currency: pi.currency,
    incoterm: quote?.incoterm ?? "FOB",
    pol: quote?.pol ?? "Xiamen, China",
    /* 目的港。报价单上填过就用那个（那是港口名，本来就是英文）；
       没有报价单的老单子退回买方国家的**英文名** —— 退回中文名，
       这张纸到了对方清关行手里就是一团乱码 */
    pod: quote?.pod || countryEn(buyer?.country),
    payTerm: quote?.payTerm ?? "30% T/T deposit, 70% against copy of B/L",
    marks: pi.ext?.shipmark ?? "N/M",
    termLine: termPlace(quote?.incoterm ?? "FOB", quote?.pol ?? "Xiamen, China", quote?.pod || countryEn(buyer?.country)),
    lines,
    totalCents: sum("amountCents"),
    totalQty: sum("qty"),
    totalCartons: sum("cartons"),
    totalNetKg: sum("netKg"),
    totalGrossKg: sum("grossKg"),
    totalCbm: sum("cbm"),
  };
}

/* ═══════════════════ 金额大写 ═══════════════════ */

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  return `${ONES[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` AND ${under1000(n % 100)}` : ""}`;
}

const CURRENCY_WORD: Record<string, [string, string]> = {
  USD: ["US DOLLARS", "CENTS"],
  EUR: ["EUROS", "CENTS"],
  GBP: ["POUNDS STERLING", "PENCE"],
  CNY: ["CHINESE YUAN", "FEN"],
};

/**
 * 金额大写。清关和银行审单要看这一行，缺了有些国家会退单。
 * 只做到十亿级 —— 再大的单据这个系统的用户开不出来。
 */
export function amountInWords(cents: number, currency: string) {
  const [unit, sub] = CURRENCY_WORD[currency] ?? [currency, "CENTS"];
  const whole = Math.floor(Math.abs(cents) / 100);
  const frac = Math.abs(cents) % 100;
  if (whole === 0 && frac === 0) return `SAY ${unit} ZERO ONLY.`;

  const parts: string[] = [];
  const scales: Array<[number, string]> = [
    [1_000_000_000, "BILLION"],
    [1_000_000, "MILLION"],
    [1_000, "THOUSAND"],
  ];
  let rest = whole;
  for (const [size, word] of scales) {
    if (rest >= size) {
      parts.push(`${under1000(Math.floor(rest / size))} ${word}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(under1000(rest));

  const head = parts.join(" ") || "ZERO";
  const tail = frac > 0 ? ` AND ${under1000(frac)} ${sub}` : "";
  return `SAY ${unit} ${head}${tail} ONLY.`;
}

/** 单据上要不要显示这一列 */
export const showsPacking = (k: DocKind) => k === "PL";
export const showsPrice = (k: DocKind) => k !== "PL";

/** 挂在这张 PI 上、跟单据同类的附件，打印弹层里提示一下已经归档过哪几份 */
export const docAttachments = (db: Database, piId: string): Attachment[] =>
  db.attachments.filter((a) => a.entity === "pi" && a.entityId === piId);

/**
 * 贸易术语后面跟的地名。
 *
 * Incoterms 里这个地名的含义随术语而变，不是随便挂一个目的地就行：
 *   EXW / FOB  → **装运港**（风险在装运港转移）
 *   CFR / CIF / DDP → **目的港 / 目的地**
 *
 * 写反了就是一张自相矛盾的单据："FOB Brazil"——巴西没有我们的船，
 * 客户的清关行看到会直接打电话回来问。
 */
export function termPlace(incoterm: string, pol: string, pod: string) {
  const atOrigin = incoterm === "EXW" || incoterm === "FOB" || incoterm === "FCA";
  const place = atOrigin ? pol : pod;
  return place ? `${incoterm} ${place}` : incoterm;
}

/**
 * 联系人与演示附件。
 *
 * 两件事都很小，但都得在主种子之后跑（要挂已有的客户和单据），
 * 所以单独一个文件，不再往 seed.ts 里堆。
 */

import type { Attachment, Contact, Customer, Database } from "./types";

/* ═══════════════════ 客户联系人 ═══════════════════ */

/**
 * 邮箱域名从公司名推。
 *
 * 先砍掉公司后缀 —— "Rheinland GmbH" 的域名是 rheinland.de，不是 rheinlandgmbh.de。
 * 顶级域跟着国家走：德国客户用 .de 的邮箱，用 .com 会让整套演示数据看着像随机生成的。
 */
const SUFFIX = /\b(inc|llc|ltd|limited|gmbh|bv|srl|spa|kk|pte|jsc|fze|sa|sas|ag|as|oy|co)\b\.?/gi;

const TLD: Record<string, string> = {
  美国: "com", 加拿大: "ca", 德国: "de", 法国: "fr", 英国: "co.uk", 荷兰: "nl", 意大利: "it",
  西班牙: "es", 波兰: "pl", 罗马尼亚: "ro", 土耳其: "com.tr", 澳大利亚: "com.au", 韩国: "co.kr",
  日本: "co.jp", 新加坡: "com.sg", 越南: "vn", 印度: "in", 沙特: "com.sa", 阿联酋: "ae",
  南非: "co.za", 巴西: "com.br", 墨西哥: "mx", 智利: "cl", 秘鲁: "com.pe",
};

function domainOf(c: Customer) {
  const stem = c.name.replace(SUFFIX, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 18) || "trade";
  return `${stem}.${TLD[c.country] ?? "com"}`;
}

const mailbox = (name: string) => name.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "") || "info";

/** 各地常见的财务 / 仓储对接人名字。够用就行，不追求穷举 */
const SECOND: Record<string, string[]> = {
  欧洲: ["Petra Klein", "Luc Martin", "Sanne Bakker", "Marco Rossi", "Elena Ruiz", "Tomasz Nowak"],
  美洲: ["Grace Bennett", "Carlos Mendoza", "Julia Santos", "Daniel Cohen"],
  亚太: ["Min-seo Kang", "Yuki Tanaka", "Wei Lin", "Arun Menon", "Thu Ha Nguyen"],
  中东非: ["Nadia Saleh", "Yousef Karim", "Sipho Dlamini"],
};

const REGION: Record<string, keyof typeof SECOND> = {
  德国: "欧洲", 法国: "欧洲", 英国: "欧洲", 荷兰: "欧洲", 意大利: "欧洲", 西班牙: "欧洲",
  波兰: "欧洲", 罗马尼亚: "欧洲", 土耳其: "欧洲",
  美国: "美洲", 加拿大: "美洲", 巴西: "美洲", 墨西哥: "美洲", 智利: "美洲", 秘鲁: "美洲",
  韩国: "亚太", 日本: "亚太", 新加坡: "亚太", 越南: "亚太", 印度: "亚太", 澳大利亚: "亚太",
  沙特: "中东非", 阿联酋: "中东非", 南非: "中东非",
};

/**
 * 联系人。
 *
 * 主联系人照搬客户档案上原来那个字符串 —— 不能凭空换个人，
 * 那会让老数据看起来像被改过。第二个人（财务 / 收货）按客户序号决定加不加，
 * 用取模而不是随机：同一份种子在任何人机器上都得是同一份数据。
 */
export function buildContacts(customers: Customer[], id: (p: string) => string): Contact[] {
  const out: Contact[] = [];
  customers.forEach((c, i) => {
    const domain = domainOf(c);
    if (c.contact) {
      out.push({
        id: id("ct"),
        customerId: c.id,
        name: c.contact,
        title: "Purchasing Manager",
        email: `${mailbox(c.contact)}@${domain}`,
        phone: null,
        im: i % 3 === 0 ? `WhatsApp +${10 + (i % 80)}-xxx-${1000 + i}` : null,
        duty: "采购",
        primary: true,
        note: null,
      });
    }
    // 三分之二的客户有第二个对接人 —— 对账和到货通知不发给采购
    if (i % 3 !== 2) {
      const pool = SECOND[REGION[c.country] ?? "欧洲"];
      const name = pool[i % pool.length];
      const finance = i % 2 === 0;
      out.push({
        id: id("ct"),
        customerId: c.id,
        name,
        title: finance ? "Finance" : "Warehouse",
        email: `${finance ? "ap" : "warehouse"}@${domain}`,
        phone: null,
        im: null,
        duty: finance ? "财务" : "收货",
        primary: false,
        note: finance ? "对账单和水单发这里" : "到货通知发这里，只在工作日收货",
      });
    }
  });
  return out;
}

/* ═══════════════════ 演示附件 ═══════════════════ */

/**
 * 占位附件。
 *
 * 有元信息、没有文件本体（`placeholder: true`），点下载会明确说明原因。
 * 为什么还要放：附件区空着的时候，用户看不出这个位置**应该**有什么。
 * 一张挂着「盖章 PI.pdf、水单.jpg、验货报告.pdf」的单据，
 * 一眼就说明了这套系统怎么用。
 */
export function buildDemoAttachments(db: Database): Attachment[] {
  const out: Attachment[] = [];
  const at = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  let i = 0;
  const push = (entity: string, entityId: string, name: string, kind: string, size: number, mime: string, who: string, days: number) => {
    out.push({
      id: `att_${(++i).toString(36).padStart(3, "0")}`,
      entity,
      entityId,
      name,
      size,
      mime,
      blobKey: null,
      placeholder: true,
      kind,
      uploadedBy: null,
      uploaderName: who,
      uploadedAt: at(days),
      note: null,
    });
  };

  const finance = db.users.find((u) => u.role === "finance")?.name ?? "陈曦";
  const merch = db.users.find((u) => u.role === "merchandiser")?.name ?? "郑楠";

  for (const pi of db.pis.slice(0, 8)) {
    const sales = db.users.find((u) => u.id === pi.salesId)?.name ?? "Ada";
    push("pi", pi.id, `${pi.piNo}_PI_signed.pdf`, "合同 / PI", 284_112, "application/pdf", sales, 12);
    if (Number(pi.piNo.slice(-1)) % 2 === 0) {
      push("pi", pi.id, `${pi.piNo}_CI.pdf`, "商业发票", 176_540, "application/pdf", finance, 6);
    }
  }
  for (const s of db.shipments.slice(0, 6)) {
    push("shipment", s.id, `${s.batchNo}_BL_draft.pdf`, "提单", 512_880, "application/pdf", merch, 4);
    push("shipment", s.id, `${s.batchNo}_装柜照片.jpg`, "其他", 2_240_100, "image/jpeg", merch, 3);
  }
  for (const p of db.ops.payments.filter((x) => x.direction === "in").slice(0, 6)) {
    push("payment", p.id, `${p.paymentNo}_水单.jpg`, "水单 / 回单", 864_220, "image/jpeg", finance, 2);
  }
  return out;
}

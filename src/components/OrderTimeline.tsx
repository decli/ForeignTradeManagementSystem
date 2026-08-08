/**
 * 一单到底：从询盘到退税的一条链路。
 *
 * ── 为什么这张图值得单独做 ──
 * 系统里的数据本来就是串起来的（`piId` 贯穿全库），但用户看不见这件事 ——
 * 他在八个页面之间跳来跳去，每一页只给他一段。这张图把八段接成一条，
 * 每个节点可以点进去。演示给老板看的时候，这是唯一一屏就能说清
 * "为什么要用一套系统而不是八个 Excel"的东西。
 *
 * ── 节点的三种状态，只有三种 ──
 * 完成 / 进行中 / 还没到。不做"部分完成""异常"这些中间态：
 * 一条八个节点的链路，每个节点再分五档，看的人要在脑子里解四十个组合。
 * 有问题的节点用一句话说清（"3 张发票没关联"），比多一种颜色管用。
 */

import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useDb } from "@/data/DataProvider";
import type { Database, Pi } from "@/data/types";
import { QUOTE_STATUS } from "@/data/presales-types";
import { centsToYuan, formatMoney, shortDate } from "@/lib/format";
import { useT } from "@/i18n";

type Node = {
  key: string;
  icon: IconName;
  title: string;
  /** 一句话说清这一段的结果。没到的节点给一句"还没发生什么" */
  detail: string;
  state: "done" | "now" | "todo";
  href?: string;
  when?: string | null;
};

function buildNodes(db: Database, pi: Pi, t: (s: string, v?: Record<string, string | number>) => string): Node[] {
  const quote = pi.quoteId ? db.presales.quotes.find((q) => q.id === pi.quoteId) : undefined;
  const inquiry = quote?.inquiryId ? db.presales.inquiries.find((i) => i.id === quote.inquiryId) : undefined;
  const samples = inquiry ? db.presales.samples.filter((s) => s.inquiryId === inquiry.id) : [];
  const contracts = db.ops.contracts.filter((c) => c.piId === pi.id);
  const prods = db.ops.productions.filter((p) => p.piId === pi.id);
  const shipments = db.shipments.filter((s) => s.piId === pi.id);
  const payIn = db.ops.payments.filter((p) => p.piId === pi.id && p.direction === "in");
  const costing = db.costings.find((c) => c.piId === pi.id);
  const tax = db.taxInvoices.filter((x) => x.piId === pi.id);

  const sym = pi.currency === "CNY" ? "¥" : pi.currency === "EUR" ? "€" : "$";
  const atd = shipments
    .flatMap((s) => db.milestones.filter((m) => m.shipmentId === s.id && m.kind === "ATD" && m.actualOn))
    .map((m) => m.actualOn!)
    .sort()[0];

  const nodes: Node[] = [];

  nodes.push(
    inquiry
      ? {
          key: "inquiry",
          icon: "inbox",
          title: t("询盘"),
          detail: t("{co} · 来自{src}", { co: inquiry.company, src: t(inquiry.source) }),
          state: "done",
          href: `/inquiries?q=${inquiry.inquiryNo}`,
          when: inquiry.receivedAt.slice(0, 10),
        }
      : {
          key: "inquiry",
          icon: "inbox",
          title: t("询盘"),
          /* 老单子是直接从 PI 开始的（系统上线前就存在），
             说清楚"没有记录"而不是留白 —— 留白会被读成"这一步没做" */
          detail: t("没有关联询盘 —— 这张单是直接取号建的"),
          state: "todo",
        },
  );

  if (samples.length) {
    const last = samples[samples.length - 1];
    nodes.push({
      key: "sample",
      icon: "box",
      title: t("寄样"),
      detail: t("{n} 单 · {p}", { n: samples.length, p: last.productName }),
      state: last.feedback ? "done" : "now",
      href: `/samples?q=${last.sampleNo}`,
      when: last.sentOn,
    });
  }

  nodes.push(
    quote
      ? {
          key: "quote",
          icon: "tag",
          title: t("报价"),
          detail: t("{no} 第 {v} 版 · {st}", { no: quote.quoteNo, v: quote.version, st: t(QUOTE_STATUS[quote.status] ?? quote.status) }),
          state: "done",
          href: `/quotes?q=${quote.quoteNo}`,
          when: quote.createdAt.slice(0, 10),
        }
      : { key: "quote", icon: "tag", title: t("报价"), detail: t("没有关联报价单"), state: "todo" },
  );

  nodes.push({
    key: "pi",
    icon: "file",
    title: "PI",
    detail: t("{no} · {amt}", { no: pi.piNo, amt: formatMoney(centsToYuan(pi.amountCents), sym) }),
    state: "done",
    href: `/orders?q=${pi.piNo}`,
    when: pi.signedOn,
  });

  nodes.push(
    contracts.length
      ? {
          key: "purchase",
          icon: "cart",
          title: t("采购合同"),
          detail: t("{n} 份 · 已付 {paid}", {
            n: contracts.length,
            paid: formatMoney(centsToYuan(contracts.reduce((s, c) => s + c.paidCents, 0)), "¥"),
          }),
          state: contracts.every((c) => c.paidCents >= c.amountCents) ? "done" : "now",
          href: `/purchase-contract?q=${pi.piNo}`,
          when: contracts[0]?.signedOn,
        }
      : { key: "purchase", icon: "cart", title: t("采购合同"), detail: t("还没下采购"), state: "todo" },
  );

  nodes.push(
    prods.length
      ? {
          key: "prod",
          icon: "play",
          title: t("生产"),
          detail: t("{n} 张生产单 · {done} 张完工", { n: prods.length, done: prods.filter((p) => p.status === "done").length }),
          state: prods.every((p) => p.status === "done") ? "done" : "now",
          href: `/production?q=${pi.piNo}`,
          when: prods[0]?.startOn,
        }
      : { key: "prod", icon: "play", title: t("生产"), detail: t("还没排产"), state: "todo" },
  );

  nodes.push(
    shipments.length
      ? {
          key: "ship",
          icon: "ship",
          title: t("出运"),
          detail: t("{n} 个批次 · {rel}", { n: shipments.length, rel: shipments.every((s) => s.releaseState === "已放行") ? t("全部已放行") : t("还有未放行") }),
          state: atd ? (shipments.every((s) => s.releaseState === "已放行") ? "done" : "now") : "now",
          href: `/follow-ups?q=${pi.piNo}`,
          when: atd ?? null,
        }
      : { key: "ship", icon: "ship", title: t("出运"), detail: t("还没安排出运"), state: "todo" },
  );

  const received = costing?.receivableCents ?? 0;
  nodes.push({
    key: "pay",
    icon: "wallet",
    title: t("收款"),
    detail:
      received >= pi.amountCents
        ? t("已收齐 {amt}", { amt: formatMoney(centsToYuan(received), sym) })
        : received > 0
          ? t("已收 {amt} / {total}", { amt: formatMoney(centsToYuan(received), sym), total: formatMoney(centsToYuan(pi.amountCents), sym) })
          : t("一分还没收"),
    state: received >= pi.amountCents ? "done" : received > 0 ? "now" : "todo",
    href: `/receivables?q=${pi.piNo}`,
    when: payIn[0]?.paidOn ?? null,
  });

  nodes.push(
    tax.length
      ? {
          key: "tax",
          icon: "shield",
          title: t("退税"),
          detail: t("{n} 张发票 · 税额 {amt}", { n: tax.length, amt: formatMoney(centsToYuan(tax.reduce((s, x) => s + x.taxCents, 0)), "¥") }),
          state: "done",
          href: `/tax-refund?q=${pi.piNo}`,
          when: tax[0]?.exportedOn,
        }
      : { key: "tax", icon: "shield", title: t("退税"), detail: t("还没关联退税发票"), state: "todo" },
  );

  return nodes;
}

export function OrderTimeline({ pi }: { pi: Pi }) {
  const db = useDb();
  const { t } = useT();
  const nodes = buildNodes(db, pi, t);
  const done = nodes.filter((n) => n.state === "done").length;

  return (
    <div className="otl">
      <header className="otl-head">
        <b>{t("一单到底")}</b>
        <span className="muted">{t("{done} / {all} 段已完成", { done, all: nodes.length })}</span>
      </header>
      <ol className="otl-list">
        {nodes.map((n) => {
          const body = (
            <>
              <span className="otl-dot">
                <Icon name={n.state === "done" ? "check" : n.icon} size={13} />
              </span>
              <span className="otl-main">
                <b>{n.title}</b>
                <span>{n.detail}</span>
              </span>
              {n.when ? <span className="otl-when num">{shortDate(n.when)}</span> : null}
            </>
          );
          return (
            <li key={n.key} data-state={n.state}>
              {n.href ? (
                <Link to={n.href} className="otl-node">
                  {body}
                </Link>
              ) : (
                <span className="otl-node">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

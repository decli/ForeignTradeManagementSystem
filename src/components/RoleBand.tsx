/**
 * 首页顶部的「角色条」。
 *
 * ── 为什么首页要按角色分家 ──
 * 老板打开看板想知道的是"这个月赚不赚、钱回没回来"；
 * 业务员想知道的是"我今天先干哪件"。同一屏 KPI 同时服务这两个人，
 * 结果是两个人都要先跳过一半跟自己无关的东西。
 *
 * 但也不做成两个完全不同的首页 —— 那样切换角色就像换了个系统，
 * 而且中间还有跟单员、采购、财务。做法是：下面的经营大盘所有人都一样，
 * 顶上加一条**只属于你**的行动清单，各人看到的内容不同，位置和形态一致。
 *
 * ── 清单里的每一条都必须是"能点进去干活"的 ──
 * 不放"本月出运 12 票"这种陈述句。陈述句属于下面的 KPI 卡；
 * 这里只放祈使句：这三条询盘超时了、这两笔审批等你、这五张单该催款了。
 */

import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { viewerOf } from "@/data/queries";
import { agingSummary, listAging, listApprovals } from "@/data/flow-queries";
import { listInquiries, listQuotes, listSamples } from "@/data/presales-queries";
import { centsToYuan, formatCompact } from "@/lib/format";
import { useT } from "@/i18n";

/**
 * ── 为什么拆成 text + detail 两段 ──
 * 原来每条是一句长句子（「$1.27M 应收逾期 · 31 张单 · 加权平均 43 天」）。
 * 塞进等宽格子后短句一行、长句两行，一排卡片高高低低；
 * 而且换行点由宽度决定，会断在「先查中信保报损 / 时限」这种地方。
 *
 * 拆开之后：第一行是**扫一眼就够**的结论（数字 + 干什么），
 * 第二行是支撑细节。每条都有两行，高度天然一致，
 * 换行也发生在语义边界上而不是随机位置。
 */
type Item = { icon: IconName; text: string; detail: string; href: string; tone: "coral" | "amber" | "accent" };

export function RoleBand() {
  const db = useDb();
  const { user, displayName } = useAuth();
  const { t } = useT();
  const viewer = viewerOf(user);
  const role = user?.role ?? "viewer";

  const items: Item[] = [];

  /* 所有角色共用的第一条：轮到我审的。它最有时效性 —— 别人在等 */
  const mineRows = listApprovals(db, viewer, { mine: true });
  if (mineRows.length) {
    const worst = Math.max(...mineRows.map((r) => r.waitHours));
    items.push({
      icon: "check",
      text: t("{n} 笔审批等你拍板", { n: mineRows.length }),
      // 别人在等这件事，最久那笔等了多久才是真正的紧迫度
      detail: worst >= 24 ? t("最久已等 {n} 天", { n: Math.floor(worst / 24) }) : t("最久已等 {n} 小时", { n: Math.round(worst) }),
      href: "/approvals?view=mine",
      tone: "amber",
    });
  }

  if (role === "sales" || role === "admin") {
    const inq = listInquiries(db, viewer);
    const breach = inq.filter((i) => i.sla === "breach").length;
    if (breach) items.push({ icon: "inbox", text: t("{n} 条询盘还没回", { n: breach }), detail: t("已超过 24 小时响应线"), href: "/inquiries?sla=breach", tone: "coral" });

    const dueFollow = inq.filter((i) => i.followIn !== null && i.followIn < 0).length;
    if (dueFollow) items.push({ icon: "clock", text: t("{n} 条询盘该跟进了", { n: dueFollow }), detail: t("已过自己定的跟进日"), href: "/inquiries?status=working", tone: "amber" });

    const expiring = listQuotes(db, viewer).filter((q) => (q.status === "sent" || q.status === "negotiating") && q.expireIn >= 0 && q.expireIn <= 3).length;
    if (expiring) items.push({ icon: "tag", text: t("{n} 张报价快过期", { n: expiring }), detail: t("3 天内到有效期"), href: "/quotes?status=sent", tone: "amber" });

    const chase = listSamples(db, viewer).filter((s) => s.status !== "closed" && s.followIn !== null && s.followIn < 0).length;
    if (chase) items.push({ icon: "box", text: t("{n} 个样品该催反馈", { n: chase }), detail: t("寄出后一直没有回音"), href: "/samples", tone: "accent" });
  }

  if (role === "admin" || role === "finance") {
    const aging = listAging(db, viewer);
    const sum = agingSummary(aging);
    if (sum.overdueCount) {
      items.push({
        icon: "wallet",
        text: t("{amt} 应收逾期", { amt: formatCompact(centsToYuan(sum.overdueCents), "$") }),
        detail: t("{n} 张单 · 按金额加权平均 {d} 天", { n: sum.overdueCount, d: sum.weightedDays.toFixed(0) }),
        href: "/receivables",
        tone: sum.weightedDays > 45 ? "coral" : "amber",
      });
    }
    const bad = aging.filter((r) => r.overdue > 90);
    if (bad.length) items.push({ icon: "shield", text: t("{n} 张单逾期超 90 天", { n: bad.length }), detail: t("先查中信保报损时限"), href: "/receivables?bucket=逾期 90 天以上", tone: "coral" });
  }

  if (role === "merchandiser" || role === "purchaser") {
    const noLines = db.pis.filter((p) => p.status === "open" && !db.piLines.some((l) => l.piId === p.id)).length;
    if (noLines) items.push({ icon: "file", text: t("{n} 张 PI 缺商品明细", { n: noLines }), detail: t("开不出发票和装箱单"), href: "/pi", tone: "amber" });
  }

  const hour = new Date().getHours();
  const greeting = hour < 6 ? t("还没睡") : hour < 11 ? t("早上好") : hour < 14 ? t("中午好") : hour < 18 ? t("下午好") : t("晚上好");

  return (
    <section className="roleband" data-empty={items.length ? undefined : "1"}>
      <div className="rb-head">
        <b>
          {greeting}，{displayName}
        </b>
        <span className="muted">{items.length ? t("这几件事今天该动一下") : t("你名下没有待办 —— 下面是经营大盘")}</span>
      </div>
      {items.length ? (
        <ul className="rb-list">
          {items.map((it, i) => (
            <li key={i}>
              {/* 整条都能点。标题一行、细节一行，两行是固定结构 ——
                  高度一致靠的是结构一致，不是写死高度 */}
              <Link to={it.href} data-tone={it.tone}>
                <Icon name={it.icon} size={15} />
                <span className="rb-main">
                  <b className="truncate">{it.text}</b>
                  <i className="truncate">{it.detail}</i>
                </span>
                <Icon name="chevronRight" size={13} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

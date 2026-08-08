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

type Item = { icon: IconName; text: string; href: string; tone: "coral" | "amber" | "accent" };

export function RoleBand() {
  const db = useDb();
  const { user, displayName } = useAuth();
  const { t } = useT();
  const viewer = viewerOf(user);
  const role = user?.role ?? "viewer";

  const items: Item[] = [];

  /* 所有角色共用的第一条：轮到我审的。它最有时效性 —— 别人在等 */
  const mine = listApprovals(db, viewer, { mine: true }).length;
  if (mine) items.push({ icon: "check", text: t("{n} 笔审批等你拍板", { n: mine }), href: "/approvals?view=mine", tone: "amber" });

  if (role === "sales" || role === "admin") {
    const inq = listInquiries(db, viewer);
    const breach = inq.filter((i) => i.sla === "breach").length;
    if (breach) items.push({ icon: "inbox", text: t("{n} 条询盘超过 24 小时没回", { n: breach }), href: "/inquiries?sla=breach", tone: "coral" });

    const dueFollow = inq.filter((i) => i.followIn !== null && i.followIn < 0).length;
    if (dueFollow) items.push({ icon: "clock", text: t("{n} 条询盘过了该跟进的日子", { n: dueFollow }), href: "/inquiries?status=working", tone: "amber" });

    const expiring = listQuotes(db, viewer).filter((q) => (q.status === "sent" || q.status === "negotiating") && q.expireIn >= 0 && q.expireIn <= 3).length;
    if (expiring) items.push({ icon: "tag", text: t("{n} 张报价 3 天内过期", { n: expiring }), href: "/quotes?status=sent", tone: "amber" });

    const chase = listSamples(db, viewer).filter((s) => s.status !== "closed" && s.followIn !== null && s.followIn < 0).length;
    if (chase) items.push({ icon: "box", text: t("{n} 个样品该催反馈了", { n: chase }), href: "/samples", tone: "accent" });
  }

  if (role === "admin" || role === "finance") {
    const aging = listAging(db, viewer);
    const sum = agingSummary(aging);
    if (sum.overdueCount) {
      items.push({
        icon: "wallet",
        text: t("{amt} 应收逾期 · {n} 张单 · 加权平均 {d} 天", { amt: formatCompact(centsToYuan(sum.overdueCents), "$"), n: sum.overdueCount, d: sum.weightedDays.toFixed(0) }),
        href: "/receivables",
        tone: sum.weightedDays > 45 ? "coral" : "amber",
      });
    }
    const bad = aging.filter((r) => r.overdue > 90);
    if (bad.length) items.push({ icon: "shield", text: t("{n} 张单逾期超 90 天 —— 先查中信保报损时限", { n: bad.length }), href: "/receivables?bucket=逾期 90 天以上", tone: "coral" });
  }

  if (role === "merchandiser" || role === "purchaser") {
    const noLines = db.pis.filter((p) => p.status === "open" && !db.piLines.some((l) => l.piId === p.id)).length;
    if (noLines) items.push({ icon: "file", text: t("{n} 张在跟 PI 还没有商品明细，开不出发票和装箱单", { n: noLines }), href: "/pi", tone: "amber" });
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
              <Link to={it.href} data-tone={it.tone}>
                <Icon name={it.icon} size={14} />
                <span>{it.text}</span>
                <Icon name="chevronRight" size={13} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

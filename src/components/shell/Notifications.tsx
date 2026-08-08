/**
 * 通知铃铛。
 *
 * ── 两个来源，一个列表 ──
 * 落库的**事件型**（审批到你了、你的审批被驳回）+ 实时算的**派生型**
 * （回款逾期、询盘超时、样品该催了）。用户不需要知道这个区别，
 * 但派生型标一个「实时」小字 —— 因为它们没有"已读"这个动作：
 * 问题解决了它自己就消失。
 *
 * ── 红点数只算未读的事件型 + 全部派生型 ──
 * 派生型没有已读状态，但它们代表的是**还没处理的事**，必须计入。
 * 一个"你有 0 条通知"却列着五条逾期回款的铃铛，比不显示更糟。
 *
 * ── 悬停展开，跟汇率和世界时间一致 ──
 * 顶栏三个信息件（汇率 / 世界时间 / 通知）交互必须一样，
 * 否则用户要记住"哪个是点的、哪个是悬停的"。
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Menu } from "@/components/ui/Menu";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { viewerOf } from "@/data/queries";
import { listNotices } from "@/data/flow-queries";
import { markAllRead, markRead } from "@/data/flow-mutations";
import { deriveNotices } from "@/lib/notify";
import { relativeTime } from "@/lib/format";
import { useT } from "@/i18n";

const ICON: Record<string, IconName> = {
  approval: "check",
  overdue: "wallet",
  inquiry: "inbox",
  credit: "shield",
  stall: "ship",
  quote: "tag",
  sample: "box",
  cert: "alert",
  lowmargin: "gauge",
  system: "info",
  mention: "users",
  assign: "user",
};

/** 一次最多画多少行。超出的部分明说，不是悄悄吞掉 */
const SHOW = 40;

export function Notifications() {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const viewer = viewerOf(user);

  const derived = useMemo(() => deriveNotices(db, viewer), [db, viewer]);
  const all = useMemo(() => listNotices(db, viewer, derived), [db, viewer, derived]);
  /* 红点数从**全量**里算，画多少行是另一回事 —— 两件事混在一起，
     数字就会跟着渲染上限走，而不是跟着真实待办走。 */
  const unread = all.filter((r) => r.derived || !r.read).length;
  const rows = all.slice(0, SHOW);
  const hidden = all.length - rows.length;

  return (
    <Menu
      hover
      align="end"
      width={380}
      trigger={(p) => (
        <button className="icon-btn bell" {...p} ref={p.ref} data-tip={t("通知")} aria-label={t("通知 · {n} 条待处理", { n: unread })}>
          <Icon name="alert" />
          {unread ? <span className="bell-dot">{unread > 99 ? "99+" : unread}</span> : null}
        </button>
      )}
    >
      {(close) => (
        <div className="ntf">
          <header className="ntf-head">
            <b>{t("通知")}</b>
            <span className="muted">{t("{n} 条待处理", { n: unread })}</span>
            <span className="spacer" />
            <button className="link-btn" onClick={() => markAllRead(viewer.id)}>
              {t("全部已读")}
            </button>
          </header>

          <div className="ntf-list">
            {rows.length === 0 ? (
              <p className="ntf-empty">{t("没有新通知。逾期回款、超时询盘、该催的样品都会出现在这里。")}</p>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  className="ntf-row"
                  data-unread={!r.derived && !r.read ? "1" : undefined}
                  onClick={() => {
                    if (!r.derived) markRead([r.id]);
                    if (r.href) nav(r.href);
                    close();
                  }}
                >
                  <span className="ntf-ic" data-k={r.kind}>
                    <Icon name={ICON[r.kind] ?? "info"} size={14} />
                  </span>
                  <span className="ntf-main">
                    <b>
                      {r.title}
                      {/* 派生型没有"已读"这个动作 —— 问题解决了它自己就消失 */}
                      {r.derived ? <i className="ntf-live">{t("实时")}</i> : null}
                    </b>
                    <span>{r.body}</span>
                  </span>
                  {!r.derived ? <span className="ntf-when">{relativeTime(r.at)}</span> : null}
                </button>
              ))
            )}
            {/* 截断了就说出来。少画几行没关系，让人以为「就这些」才是问题 */}
            {hidden > 0 ? <p className="ntf-more">{t("还有 {n} 条更早的没有列出", { n: hidden })}</p> : null}
          </div>
        </div>
      )}
    </Menu>
  );
}

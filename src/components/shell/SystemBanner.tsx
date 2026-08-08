/**
 * 系统级横幅 —— 关于**账套本身**的话，不是关于某张单据的话。
 *
 * ── 为什么集中成一个组件 ──
 * 「结构已升级」「账套只读」「存储可能被清空」这几件事有一个共同点：
 * 它们跟用户当前在哪个页面无关，而且**同时出现两条就等于一条都没说**。
 * 所以这里只渲染优先级最高的那一条，其余的等它被处理掉再冒头。
 *
 * ── 常驻警告等于没有警告 ──
 * 只有真正需要用户做点什么的时候才出现。一切正常时这个组件渲染 null，
 * 不占一个像素。可关闭的那些关掉之后按内容记住，不会每次刷新都来一遍。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useDb } from "@/data/DataProvider";
import { isReadOnly, schemaState } from "@/data/db";
import { formatBytes } from "@/data/files";
import { readStorageHealth, type StorageHealth } from "@/lib/storage-health";
import { useT } from "@/i18n";

type Level = "danger" | "warn" | "info";

type Notice = {
  /** 关闭状态按 id 记住。内容变了就换 id，让新消息还能出现一次 */
  id: string;
  level: Level;
  icon: IconName;
  title: string;
  body: string;
  /** 不给关闭按钮 —— 用户没法处理、但必须一直知道的事 */
  sticky?: boolean;
  action?: { label: string; run: () => void };
};

const DISMISS_KEY = "mt.banner.dismissed";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function SystemBanner() {
  const { t } = useT();
  const navigate = useNavigate();
  const db = useDb();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [, force] = useState(0);

  // 迁移状态是在 load() 里定下的，可能比首帧还早也可能还没到，补一次重读
  useEffect(() => {
    const id = window.setTimeout(() => force((n) => n + 1), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    void readStorageHealth(db.lastExportAt ?? null).then(setHealth);
  }, [db.lastExportAt]);

  const notices: Notice[] = [];
  const schema = schemaState();

  if (isReadOnly() && schema.kind === "ahead") {
    notices.push({
      id: "schema-ahead",
      level: "danger",
      icon: "shield",
      sticky: true,
      title: t("账套结构比当前页面新，已切换为只读"),
      body: t(
        "这份账套是 v{saved} 存下的，当前页面只认到 v{app} —— 多半是浏览器用了缓存的旧版本。为避免把新字段写没，这里不会保存任何改动。请强制刷新（⇧+刷新）拿到最新版本。",
        { saved: String(schema.saved), app: String(schema.app) },
      ),
      action: { label: t("强制刷新"), run: () => window.location.reload() },
    });
  }

  if (schema.kind === "migrated") {
    notices.push({
      id: `schema-migrated-${schema.from}`,
      level: "info",
      icon: "check",
      title: t("账套已升级到新结构，数据原样保留"),
      body: t("从 v{from} 升上来，跑了 {n} 步：{steps}。升级前的那一份已存进备份，可在「系统设置 › 数据」回滚。", {
        from: String(schema.from),
        n: String(schema.steps.length),
        steps: schema.steps.join("；"),
      }),
    });
  }

  if (health?.atRisk) {
    const why = health.reasons[0];
    const body =
      why === "quota"
        ? t("浏览器给这个站点的空间快用完了（{u} / {q}）。写满之后备份和附件会静默失败，先导出一份、再清理些附件。", {
            u: formatBytes(health.used),
            q: formatBytes(health.quota),
          })
        : why === "never-exported"
          ? t("这个账套还从来没有导出过。本地备份挡不住清空站点数据和换电脑 —— 导出一份 JSON 存到网盘，几秒钟的事。")
          : t("距上次导出已经 {n} 天。本地备份挡不住清空站点数据和换电脑，建议每周导出一份存到网盘。", {
              n: String(health.daysSinceExport ?? 0),
            });
    notices.push({
      // 天数进 id，关掉之后过些天再变严重了还能再提醒一次
      id: `storage-${why}-${why === "stale-export" ? Math.floor((health.daysSinceExport ?? 0) / 7) : "0"}`,
      level: "warn",
      icon: "alert",
      title: why === "quota" ? t("浏览器存储快满了") : t("账套还没有异地备份"),
      body,
      action: { label: t("去导出"), run: () => navigate("/settings") },
    });
  }

  const show = notices.find((n) => n.sticky || !dismissed.includes(n.id));
  if (!show) return null;

  const close = () => {
    const next = [...dismissed, show.id].slice(-20);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* 存不下就只在本次会话里关掉，不值得为此报错 */
    }
  };

  return (
    <div className={`sysbanner sysbanner-${show.level}`} role={show.level === "danger" ? "alert" : "status"}>
      <Icon name={show.icon} className="sysbanner-ico" />
      <div className="sysbanner-text">
        <b>{show.title}</b>
        <span>{show.body}</span>
      </div>
      {show.action ? (
        <button className="btn btn-ghost sysbanner-act" onClick={show.action.run}>
          {show.action.label}
        </button>
      ) : null}
      {show.sticky ? null : (
        <button className="icon-btn sysbanner-x" onClick={close} aria-label={t("知道了")}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

/**
 * 附件区。挂在抽屉 / 详情页里的一小块。
 *
 * ── 交互上的三个决定 ──
 * 1. **整块都是投放区**，不是只有那个按钮。人的直觉是把文件拖到"这一片"，
 *    做成只有按钮能接，十次里有三次会落空。
 * 2. **上传时先问是什么单据**（提单？水单？验货报告？）。多问一步换来的是
 *    单证齐套检查能自动做 —— 否则以后只能靠文件名猜，而文件名是客户起的。
 * 3. 图片和 PDF 直接在弹层里看，不下载。财务核一张水单不该先在下载文件夹里翻。
 */

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import {
  ATTACH_KINDS,
  downloadAttachment,
  formatBytes,
  listAttachments,
  openPreview,
  previewable,
  removeAttachment,
  renameAttachmentKind,
  uploadFile,
} from "@/data/files";
import type { Attachment } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { useT } from "@/i18n";

const iconOf = (a: Attachment) =>
  a.mime.startsWith("image/") ? "eye" : a.mime === "application/pdf" ? "file" : "box";

export function Attachments({
  entity,
  entityId,
  label,
  /** 这类单据应该有哪些文件。传了就做齐套检查 */
  expect,
  compact,
}: {
  entity: string;
  entityId: string;
  label: string;
  expect?: readonly string[];
  compact?: boolean;
}) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const rows = listAttachments(db, entity, entityId);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<string>(ATTACH_KINDS[0]);
  const [view, setView] = useState<{ a: Attachment; url: string } | null>(null);

  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadFile(actor, entity, entityId, label, f, kind);
      toast(t("已上传 {n} 个文件", { n: files.length }));
    } catch (e) {
      toastError(e instanceof Error ? e.message : t("上传失败"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const missing = expect?.filter((k) => !rows.some((r) => r.kind === k)) ?? [];

  return (
    <div className="att">
      <div className="att-bar">
        <select className="select select-xs" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("单据类型")} data-tip={t("先选类型，齐套检查才能自动做")}>
          {ATTACH_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="upload" size={13} />
          {busy ? t("上传中…") : t("上传文件")}
        </button>
        <span className="spacer" />
        <span className="muted att-count">{t("{n} 个附件", { n: rows.length })}</span>
      </div>

      {/* 齐套检查：缺哪份写出来。只说「不齐」等于没说 */}
      {expect && missing.length > 0 ? (
        <p className="att-missing">
          <Icon name="alert" size={13} />
          {t("还缺：{list}", { list: missing.map((m) => t(m)).join("、") })}
        </p>
      ) : null}

      <div
        className={`att-drop${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
      >
        <input ref={input} type="file" multiple hidden onChange={(e) => void take(e.target.files)} />

        {rows.length === 0 ? (
          compact ? (
            <p className="att-empty">{t("把文件拖到这里，或点上面的「上传文件」")}</p>
          ) : (
            <EmptyState icon="file" title={t("还没有附件")} desc={t("盖章 PI、水单、提单、验货报告都可以挂在这里。把文件拖进来即可。")} />
          )
        ) : (
          <ul className="att-list">
            {rows.map((a) => (
              <li key={a.id} className="att-row">
                <span className="att-ic" data-ph={a.placeholder ? "1" : undefined}>
                  <Icon name={iconOf(a)} size={15} />
                </span>
                <div className="att-main">
                  <div className="truncate strong">{a.name}</div>
                  <div className="cell-sub">
                    <span>{t(a.kind)}</span>
                    <span>·</span>
                    <span className="num">{formatBytes(a.size)}</span>
                    <span>·</span>
                    <span>{a.uploaderName}</span>
                    <span>·</span>
                    <span>{relativeTime(a.uploadedAt)}</span>
                  </div>
                </div>
                <select
                  className="select select-xs att-kind"
                  value={a.kind}
                  onChange={(e) => renameAttachmentKind(a.id, e.target.value)}
                  aria-label={t("改单据类型")}
                >
                  {ATTACH_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
                {previewable(a) ? (
                  <button
                    className="icon-btn"
                    data-tip={t("预览")}
                    aria-label={t("预览")}
                    onClick={async () => {
                      const url = await openPreview(a);
                      if (url) setView({ a, url });
                    }}
                  >
                    <Icon name="eye" size={14} />
                  </button>
                ) : null}
                <button
                  className="icon-btn"
                  data-tip={a.placeholder ? t("演示占位件，没有文件本体") : t("下载")}
                  aria-label={t("下载")}
                  onClick={() => downloadAttachment(a).catch((e) => toastError(e.message))}
                >
                  <Icon name="download" size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  data-tip={t("删除")}
                  aria-label={t("删除附件")}
                  onClick={() => void removeAttachment(actor, a.id, label).then(() => toast(t("已删除")))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!view}
        title={view?.a.name ?? ""}
        width={880}
        onClose={() => {
          if (view) URL.revokeObjectURL(view.url);
          setView(null);
        }}
      >
        {view ? (
          view.a.mime === "application/pdf" ? (
            <iframe className="att-view" src={view.url} title={view.a.name} />
          ) : (
            <img className="att-view" src={view.url} alt={view.a.name} />
          )
        ) : null}
      </Modal>
    </div>
  );
}

/** 列表页上的一个小回形针，告诉你这一行有没有附件 */
export function AttachBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="att-badge" data-tip={`${n} 个附件`}>
      <Icon name="file" size={11} />
      {n}
    </span>
  );
}

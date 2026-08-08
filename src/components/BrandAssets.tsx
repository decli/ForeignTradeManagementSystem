/**
 * 卖方主体的 Logo 与电子签章。
 *
 * ── 为什么这不是"美化" ──
 * 没有抬头 Logo、没有盖章的 PI，客户财务多半不给付款；报关行看到白纸
 * 一张的商业发票也会打回来。这是**能不能收到钱**的问题。
 *
 * ── 两个必须讲给用户听的技术约束 ──
 * 1. 章要**透明底 PNG**。单据上它压在签字线上（mix-blend-mode: multiply），
 *    白底方块贴上去一眼假。
 * 2. 图存进 files store，跟着账套走；导出 JSON 不含图片本体 ——
 *    这一条要写在界面上，否则用户换电脑导入后发现章没了会以为丢数据。
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast, toastError } from "@/components/ui/Toast";
import { dropBlob, getBlob, putBlob } from "@/data/files";
import { mutate } from "@/data/db";
import type { SellerEntity } from "@/data/types";
import { useT } from "@/i18n";

/** 抬头图不该太大：单据上最宽也就 62mm，2MB 足够印刷级 */
const MAX_BYTES = 2 * 1024 * 1024;

type Slot = "logo" | "seal";

function useBlobUrl(fileId?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let dead = false;
    let made: string | null = null;
    void getBlob(fileId).then((b) => {
      if (dead || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      dead = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileId]);
  return url;
}

function setField(entityId: string, slot: Slot, fileId: string | null) {
  mutate((d) => {
    d.sellerEntities = d.sellerEntities.map((e) =>
      e.id === entityId ? { ...e, [slot === "logo" ? "logoFileId" : "sealFileId"]: fileId } : e,
    );
  });
}

function AssetSlot({ entity, slot }: { entity: SellerEntity; slot: Slot }) {
  const { t } = useT();
  const fileId = slot === "logo" ? entity.logoFileId : entity.sealFileId;
  const url = useBlobUrl(fileId);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    if (!file.type.startsWith("image/")) return toastError(t("只能传图片"));
    if (file.size > MAX_BYTES) return toastError(t("图片太大了，控制在 2MB 以内"));
    const key = `brand_${entity.id}_${slot}`;
    try {
      await putBlob(key, file);
      setField(entity.id, slot, key);
      toast(slot === "logo" ? t("Logo 已更新") : t("签章已更新"));
    } catch {
      toastError(t("存不下，浏览器存储空间可能不够"));
    }
  };

  const clear = async () => {
    if (fileId) await dropBlob(fileId).catch(() => undefined);
    setField(entity.id, slot, null);
  };

  return (
    <div className="brand-slot">
      <div className="brand-preview" data-slot={slot} data-has={url ? "1" : "0"}>
        {url ? <img src={url} alt="" /> : <Icon name={slot === "logo" ? "building" : "shield"} size={20} />}
      </div>
      <div className="brand-meta">
        <b>{slot === "logo" ? t("公司 Logo") : t("电子签章")}</b>
        <small>
          {slot === "logo"
            ? t("打在单据左上角，最宽 62mm。PNG 或 JPG，2MB 以内。")
            : t("压在签字栏上。请用透明底 PNG —— 白底方块盖上去一眼就看得出是贴的。")}
        </small>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = "";
        }}
      />
      <button className="btn btn-sm" onClick={() => input.current?.click()}>
        {url ? t("换一张") : t("上传")}
      </button>
      {url ? (
        <button className="icon-btn danger" onClick={() => void clear()} aria-label={t("移除")} data-tip={t("移除")}>
          <Icon name="trash" size={13} />
        </button>
      ) : null}
    </div>
  );
}

export function BrandAssets({ entity }: { entity: SellerEntity }) {
  const { t } = useT();
  return (
    <div className="brand-assets">
      <AssetSlot entity={entity} slot="logo" />
      <AssetSlot entity={entity} slot="seal" />
      <p className="brand-note">
        <Icon name="info" size={12} />
        {t("图片存在本机浏览器里，导出 JSON 不含图片本体 —— 换电脑后需要重新上传一次。")}
      </p>
    </div>
  );
}

/**
 * 报价单打印 —— 售前漏斗的临门一脚。
 *
 * ── 为什么这张纸是缺口而不是锦上添花 ──
 * 系统里有核算器、有议价轨迹、有有效期，但客户最终收到的还是业务员
 * 自己拼的 Excel。于是：报价条款和系统里的不一致、有效期没写、
 * 版本号对不上、下次客户拿着一张三个月前的报价来压价还查不到出处。
 * 把最后这一步收进系统，前面那些数据才算真的有用。
 *
 * 复用 DocSheet 的 DocModel 与 print.css，所以打印排版、双语、
 * 演示水印、PDF 文件名这些行为跟其它单据完全一致。
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { getBlob } from "@/data/files";
import { isDemo } from "@/data/profile";
import type { Quotation } from "@/data/presales-types";
import { DOC_TITLES, amountInWords, buildQuoteDoc, type DocLang } from "@/lib/docs";
import { daysUntil, formatInt, shortDate } from "@/lib/format";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };
const money = (cents: number, cur: string) =>
  `${SYM[cur] ?? cur} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function L({ en, zh, lang }: { en: string; zh: string; lang: DocLang }) {
  return (
    <>
      {en}
      {lang === "both" ? <i className="doc-zh">{zh}</i> : null}
    </>
  );
}

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

/** 见 DocSheet.printAs：让「另存为 PDF」的默认文件名有意义 */
function printAs(stem: string) {
  const prev = document.title;
  document.title = stem;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  window.setTimeout(restore, 3000);
}

export function QuoteSheet({ quote, onClose }: { quote: Quotation | null; onClose: () => void }) {
  const db = useDb();
  const { t } = useT();
  const [lang, setLang] = useState<DocLang>("en");
  const doc = useMemo(() => (quote ? buildQuoteDoc(db, quote) : null), [db, quote]);
  const logoUrl = useBlobUrl(doc?.seller.logoFileId);
  const sealUrl = useBlobUrl(doc?.seller.sealFileId);

  if (!quote) return null;
  if (!doc) {
    return (
      <Modal open title={t("生成报价单")} onClose={onClose} width={520}>
        <p className="modal-lead">{t("还没有建卖方主体，开不出单据。抬头、银行账户、签章都从那里取。")}</p>
      </Modal>
    );
  }
  if (doc.lines.length === 0) {
    return (
      <Modal open title={t("生成报价单")} onClose={onClose} width={520}>
        <p className="modal-lead">{t("这张报价单还没有商品明细行 —— 先在核算器里把要报的货和数量填上。")}</p>
      </Modal>
    );
  }

  const title = DOC_TITLES.QUOTATION;
  const left = doc.validUntil ? daysUntil(doc.validUntil) : null;

  return (
    <Modal
      open
      title={t("生成报价单")}
      width={980}
      onClose={onClose}
      footer={
        <>
          <Segmented
            value={lang}
            onChange={(v) => setLang(v as DocLang)}
            options={[
              { value: "en", label: "English" },
              { value: "both", label: t("中英对照") },
            ]}
            label={t("单据语言")}
          />
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => printAs(doc.fileStem)}>
            <Icon name="download" size={14} />
            {t("打印 / 存为 PDF")}
          </button>
        </>
      }
    >
      <p className="doc-hint">
        <Icon name="info" size={13} />
        {left != null && left < 0
          ? t("⚠️ 这一版报价已经过期 {n} 天（有效期至 {d}）。发出去之前先改有效期，否则客户拿着它回来压价，你没有立场。", {
              n: String(-left),
              d: shortDate(doc.validUntil ?? null),
            })
          : quote.version > 1
            ? t("这是第 {v} 版，单据号后面带 -V{v} —— 客户手里同时有好几版时不会拿错。有效期至 {d}。", {
                v: String(quote.version),
                d: shortDate(doc.validUntil ?? null),
              })
            : t("报价单是发给客户的，所以默认英文。有效期至 {d}，过期后这张纸不作数。", {
                d: shortDate(doc.validUntil ?? null),
              })}
      </p>

      <div className="doc-sheet" data-lang={lang} data-demo-mark={isDemo() ? "DEMO 演示数据" : undefined}>
        <header className="doc-head">
          <div className="doc-seller">
            {logoUrl ? <img className="doc-logo" src={logoUrl} alt="" /> : null}
            <b>{doc.seller.nameEn ?? doc.seller.name}</b>
            {lang === "both" ? <i className="doc-zh">{doc.seller.name}</i> : null}
            <p>{doc.seller.addrEn}</p>
            <p>
              TEL: {doc.seller.tel} &nbsp;|&nbsp; EMAIL: {doc.seller.email}
            </p>
          </div>
          <h1 className="doc-title">
            {title.en}
            {lang === "both" ? <i className="doc-zh">{title.zh}</i> : null}
          </h1>
        </header>

        <section className="doc-meta">
          <div>
            <div className="dm-row">
              <span><L en="TO" zh="买方" lang={lang} /></span>
              <b>{doc.buyer?.name ?? quote.company}</b>
            </div>
            <div className="dm-row">
              <span><L en="ATTN" zh="联系人" lang={lang} /></span>
              <b>{doc.buyerContact?.name ?? "—"}</b>
            </div>
            <div className="dm-row">
              <span><L en="COUNTRY" zh="国家" lang={lang} /></span>
              <b>{doc.buyerCountryEn || "—"}</b>
            </div>
            <div className="dm-row">
              <span><L en="DELIVERY" zh="交货期" lang={lang} /></span>
              <b>{t("{n} days after order confirmed", { n: String(doc.leadDays ?? 0) })}</b>
            </div>
          </div>
          <div>
            <div className="dm-row">
              <span><L en="QUOTATION NO." zh="报价单号" lang={lang} /></span>
              <b className="num">{doc.no}</b>
            </div>
            <div className="dm-row">
              <span><L en="DATE" zh="日期" lang={lang} /></span>
              <b className="num">{doc.date}</b>
            </div>
            {/* 有效期是报价单跟其它单据最大的不同 —— 缺了它这张纸永远有效 */}
            <div className="dm-row">
              <span><L en="VALID UNTIL" zh="有效期至" lang={lang} /></span>
              <b className="num">{doc.validUntil ?? "—"}</b>
            </div>
            <div className="dm-row">
              <span><L en="TERMS" zh="贸易术语" lang={lang} /></span>
              <b>{doc.termLine}</b>
            </div>
          </div>
        </section>

        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>NO.</th>
              <th>DESCRIPTION OF GOODS</th>
              <th style={{ width: 92 }}>H.S. CODE</th>
              <th style={{ width: 90 }} className="ar">QTY</th>
              <th style={{ width: 86 }} className="ar">UNIT PRICE</th>
              <th style={{ width: 108 }} className="ar">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.seq}>
                <td className="num">{l.seq}</td>
                <td>{l.desc}</td>
                <td className="num">{l.hsCode ?? "—"}</td>
                <td className="ar num">
                  {formatInt(l.qty)} {l.unit}
                </td>
                <td className="ar num">{l.price.toFixed(4)}</td>
                <td className="ar num">{money(l.amountCents, doc.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="ar">TOTAL</td>
              <td className="ar num">{formatInt(doc.totalQty)}</td>
              <td />
              <td className="ar num">{money(doc.totalCents, doc.currency)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="doc-words">{amountInWords(doc.totalCents, doc.currency)}</p>

        <section className="doc-foot">
          <div>
            <b><L en="TERMS & CONDITIONS" zh="条款" lang={lang} /></b>
            <p>
              <L en="PAYMENT" zh="付款方式" lang={lang} />: {doc.payTerm}
            </p>
            <p>
              <L en="PACKING" zh="包装" lang={lang} />: {formatInt(doc.totalCartons)} CARTONS, {doc.totalGrossKg.toFixed(1)} KGS,{" "}
              {doc.totalCbm.toFixed(3)} CBM.
            </p>
            <p className="doc-note">
              <L
                en="This quotation is valid until the date stated above. Prices are subject to change thereafter."
                zh="本报价在上述有效期内有效，逾期价格可能调整。"
                lang={lang}
              />
            </p>
          </div>
          <div className="doc-sign">
            <b>{doc.seller.nameEn ?? doc.seller.name}</b>
            {sealUrl ? <img className="doc-seal" src={sealUrl} alt="" /> : null}
            <span className="doc-sign-line" />
            <i>
              <L en="Authorized signature & company seal" zh="授权签字及公司盖章" lang={lang} />
            </i>
          </div>
        </section>
      </div>
    </Modal>
  );
}

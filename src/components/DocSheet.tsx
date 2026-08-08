/**
 * 单据预览与打印。
 *
 * ── 为什么不生成 PDF 文件，而是走浏览器打印 ──
 * 生成 PDF 要么引一个几百 KB 的库（这个项目零依赖），要么在服务端做（没有服务端）。
 * 而浏览器的「打印 → 存储为 PDF」本来就是一条一等公民路径：
 * 排版由 CSS 控制，中文字体不用嵌、不会乱码，用户还能顺手选纸张和页边距。
 * 代价是多一步系统打印对话框 —— 换来的是零依赖和所见即所得。
 *
 * ── 打印样式的关键一条 ──
 * 打印时把整个应用外壳隐藏，只留 `.doc-sheet`。用 visibility 而不是 display，
 * 是因为 display:none 会让浏览器丢掉分页计算，长单据的表头就不重复了。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { isDemo } from "@/data/profile";
import type { Pi } from "@/data/types";
import { DOC_TITLES, amountInWords, buildDoc, showsPacking, showsPrice, type DocKind, type DocLang } from "@/lib/docs";
import { formatInt } from "@/lib/format";
import { useT } from "@/i18n";

const SYM: Record<string, string> = { USD: "$", EUR: "€", CNY: "¥", GBP: "£" };

const money = (cents: number, cur: string) =>
  `${SYM[cur] ?? cur} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 双语标签。`both` 档下中文作为小字挂在英文下面 */
function L({ en, zh, lang }: { en: string; zh: string; lang: DocLang }) {
  return (
    <>
      {en}
      {lang === "both" ? <i className="doc-zh">{zh}</i> : null}
    </>
  );
}

/**
 * `batchId` = 只给这一批出 CI / PL。
 * 从跟单表进来时带着它，从 PI 详情进来时不带（整票口径）。
 * 见 buildDoc：PI 永远是整票的，它是合同，不随出运拆分。
 */
export function DocSheet({ pi, batchId, onClose }: { pi: Pi | null; batchId?: string | null; onClose: () => void }) {
  const db = useDb();
  const { t } = useT();
  // 从批次进来的人要的就是这一批的发票，别让他再点一次
  const [kind, setKind] = useState<DocKind>(batchId ? "CI" : "PI");
  const [lang, setLang] = useState<DocLang>("en");
  const doc = useMemo(() => (pi ? buildDoc(db, pi, kind, batchId) : null), [db, pi, kind, batchId]);
  const batch = batchId ? db.shipments.find((s) => s.id === batchId) : null;
  const batchUnlogged = !!batch && !db.shipmentLines.some((l) => l.shipmentId === batch.id);

  if (!pi) return null;
  if (!doc) return null;

  /* 有批次、但没登记这批装了什么 —— 这时候绝不能默默按整票数量出单。
     那张纸是要拿去清关的，数量错了是实打实的麻烦。 */
  if (batch && batchUnlogged && kind !== "PI") {
    return (
      <Modal open title={t("生成单据")} onClose={onClose} width={560}>
        <p className="modal-lead">
          {t("批次 {no} 还没有登记装了哪些货、各多少。按批次开的商业发票和装箱单要用这一批的实际数量 —— 没有它只能按整票出，那个数拿去清关是错的。", { no: batch.batchNo })}
        </p>
        <p className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t("去 PI 详情的「出运进度」里补登，或者从这张 PI 整票出单。")}
        </p>
      </Modal>
    );
  }

  if (doc.lines.length === 0) {
    return (
      <Modal open title={t("生成单据")} onClose={onClose} width={520}>
        <p className="modal-lead">
          {t("这张 PI 还没有商品明细行，生成不了单据 —— 装箱单要按明细算箱数，发票要按明细开行。先去 PI 详情里把明细补上。")}
        </p>
      </Modal>
    );
  }

  const title = DOC_TITLES[kind];

  return (
    <Modal
      open
      title={t("生成单据")}
      width={980}
      onClose={onClose}
      footer={
        <>
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as DocKind)}
            options={[
              { value: "PI", label: t("形式发票") },
              { value: "CI", label: t("商业发票") },
              { value: "PL", label: t("装箱单") },
            ]}
            label={t("单据类型")}
          />
          {/* 单据语言跟界面语言是两件事，见 lib/docs.ts 顶部 */}
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
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Icon name="download" size={14} />
            {t("打印 / 存为 PDF")}
          </button>
        </>
      }
    >
      <p className="doc-hint">
        <Icon name="info" size={13} />
        {batch && kind !== "PI"
          ? t("正在按批次 {no} 出单：数量、箱数、毛重都是这一批的实际值，不是整张 PI 的。形式发票是合同，仍按整票出。", { no: batch.batchNo })
          : t("单据发给客户和清关行，所以默认英文 —— 界面切成中文不会改变发出去的单据。「中英对照」是给内部复核用的。")}
      </p>

      {/* 演示账套打出来的单据一律带水印。见 print.css ——
          一张看不出真假的演示商业发票流到客户或海关手里，
          比界面上任何一个 bug 都严重 */}
      <div className="doc-sheet" data-lang={lang} data-demo-mark={isDemo() ? "DEMO 演示数据" : undefined}>
        {/* ── 抬头 ── */}
        <header className="doc-head">
          <div className="doc-seller">
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

        {/* ── 抬头信息两栏 ── */}
        <section className="doc-meta">
          <div>
            <div className="dm-row">
              <span>
                <L en="TO" zh="买方" lang={lang} />
              </span>
              <b>{doc.buyer?.name ?? "—"}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="ATTN" zh="联系人" lang={lang} />
              </span>
              <b>{doc.buyerContact?.name ?? doc.buyer?.contact ?? "—"}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="COUNTRY" zh="国家" lang={lang} />
              </span>
              <b>{doc.buyerCountryEn || "—"}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="MARKS" zh="唛头" lang={lang} />
              </span>
              <b>{doc.marks}</b>
            </div>
          </div>
          <div>
            <div className="dm-row">
              <span>
                <L en={kind === "PI" ? "P/I NO." : kind === "CI" ? "INVOICE NO." : "PACKING LIST NO."} zh="单据号" lang={lang} />
              </span>
              <b className="num">{doc.no}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="DATE" zh="日期" lang={lang} />
              </span>
              <b className="num">{doc.date}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="TERMS" zh="贸易术语" lang={lang} />
              </span>
              <b>{doc.termLine}</b>
            </div>
            <div className="dm-row">
              <span>
                <L en="PORT OF LOADING" zh="装运港" lang={lang} />
              </span>
              <b>{doc.pol}</b>
            </div>
          </div>
        </section>

        {/* ── 明细 ── */}
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>NO.</th>
              <th>
                <L en="DESCRIPTION OF GOODS" zh="品名" lang={lang} />
              </th>
              {kind !== "PL" ? <th style={{ width: 92 }}>H.S. CODE</th> : null}
              <th style={{ width: 92 }} className="r">
                <L en="QTY" zh="数量" lang={lang} />
              </th>
              {showsPrice(kind) ? (
                <th style={{ width: 88 }} className="r">
                  <L en="UNIT PRICE" zh="单价" lang={lang} />
                </th>
              ) : null}
              {showsPrice(kind) ? (
                <th style={{ width: 104 }} className="r">
                  <L en="AMOUNT" zh="金额" lang={lang} />
                </th>
              ) : null}
              {showsPacking(kind) ? (
                <th style={{ width: 68 }} className="r">
                  <L en="CTNS" zh="箱数" lang={lang} />
                </th>
              ) : null}
              {showsPacking(kind) ? (
                <th style={{ width: 78 }} className="r">
                  <L en="N.W.(KG)" zh="净重" lang={lang} />
                </th>
              ) : null}
              {showsPacking(kind) ? (
                <th style={{ width: 78 }} className="r">
                  <L en="G.W.(KG)" zh="毛重" lang={lang} />
                </th>
              ) : null}
              {showsPacking(kind) ? (
                <th style={{ width: 78 }} className="r">
                  <L en="MEAS.(CBM)" zh="体积" lang={lang} />
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.seq}>
                <td className="num">{l.seq}</td>
                <td>{l.desc}</td>
                {kind !== "PL" ? <td className="num">{l.hsCode ?? "—"}</td> : null}
                <td className="r num">
                  {formatInt(l.qty)} {l.unit}
                </td>
                {showsPrice(kind) ? <td className="r num">{l.price.toFixed(4)}</td> : null}
                {showsPrice(kind) ? <td className="r num">{money(l.amountCents, doc.currency)}</td> : null}
                {showsPacking(kind) ? <td className="r num">{formatInt(l.cartons)}</td> : null}
                {showsPacking(kind) ? <td className="r num">{l.netKg.toFixed(1)}</td> : null}
                {showsPacking(kind) ? <td className="r num">{l.grossKg.toFixed(1)}</td> : null}
                {showsPacking(kind) ? <td className="r num">{l.cbm.toFixed(3)}</td> : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={kind === "PL" ? 2 : 3} className="r">
                <L en="TOTAL" zh="合计" lang={lang} />
              </td>
              <td className="r num">{formatInt(doc.totalQty)}</td>
              {showsPrice(kind) ? <td /> : null}
              {showsPrice(kind) ? <td className="r num strong">{money(doc.totalCents, doc.currency)}</td> : null}
              {showsPacking(kind) ? <td className="r num strong">{formatInt(doc.totalCartons)}</td> : null}
              {showsPacking(kind) ? <td className="r num">{doc.totalNetKg.toFixed(1)}</td> : null}
              {showsPacking(kind) ? <td className="r num">{doc.totalGrossKg.toFixed(1)}</td> : null}
              {showsPacking(kind) ? <td className="r num">{doc.totalCbm.toFixed(3)}</td> : null}
            </tr>
          </tfoot>
        </table>

        {/* ── 金额大写：清关和银行审单要看这一行 ── */}
        {showsPrice(kind) ? <p className="doc-words">{amountInWords(doc.totalCents, doc.currency)}</p> : null}

        {/* ── 条款与银行 ── */}
        <section className="doc-terms">
          {showsPrice(kind) ? (
            <div>
              <b>
                <L en="PAYMENT TERMS" zh="付款方式" lang={lang} />
              </b>
              <p>{doc.payTerm}</p>
              <b>
                <L en="BENEFICIARY BANK" zh="收款银行" lang={lang} />
              </b>
              <p>
                {doc.seller.bankEn}
                <br />
                A/C NO.: <span className="num">{doc.seller.bankAcct}</span>
                <br />
                SWIFT: <span className="num">{doc.seller.swift}</span>
                <br />
                BENEFICIARY: {doc.seller.nameEn ?? doc.seller.name}
              </p>
            </div>
          ) : (
            <div>
              <b>
                <L en="REMARKS" zh="备注" lang={lang} />
              </b>
              <p>
                TOTAL {formatInt(doc.totalCartons)} CARTONS, {doc.totalGrossKg.toFixed(1)} KGS, {doc.totalCbm.toFixed(3)} CBM.
              </p>
              <p className="doc-note">
                <L
                  en="Net weight is estimated at 92% of gross weight unless separately declared."
                  zh="净重按毛重的 92% 估算，另有申报时以申报为准。"
                  lang={lang}
                />
              </p>
            </div>
          )}
          {/* 签章位留白，用户打印后盖章。电子签章要有可信时间戳，这个项目不做假的 */}
          <div className="doc-sign">
            <b>{doc.seller.nameEn ?? doc.seller.name}</b>
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

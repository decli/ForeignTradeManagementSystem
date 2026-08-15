/**
 * 数据导入向导。
 *
 * ── 为什么这个功能决定成交 ──
 * 客户上线那天面对的是：三千个客户、五百个在手 PI、期初应收应付，全在 Excel 里。
 * 没有导入，第一批客户根本进不来。系统做得再好，"你先手工录三千条"这一句
 * 就能把整个项目挡在门外。
 *
 * ── 三步，最后一步必须是试运行 ──
 * 粘数据 → 对字段 → **看清楚要发生什么，再确认**。
 * 直接导入是最容易出事的设计：一次导错三千条，用户既不知道错在哪，
 * 也没法回滚（虽然这里有备份，但那是最后一道防线，不是日常操作）。
 * 试运行把「将新增 N 条、更新 M 条、跳过 K 条（各是什么原因）」摊开，
 * 用户点确认时知道自己在同意什么。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill, Segmented } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { mutate, pushAudit } from "@/data/db";
import type { Customer } from "@/data/types";
import type { Product, Supplier } from "@/data/ops-types";
import { guessMapping, parseTable, toNumber } from "@/lib/csv";
import { useT } from "@/i18n";

type FieldDef = { key: string; label: string; aliases: string[]; required?: boolean; hint?: string };

type Target = {
  key: string;
  label: string;
  /** 用哪一列判重。已存在就更新，不存在就新增 */
  idField: string;
  fields: FieldDef[];
  sample: string;
};

const TARGETS: Target[] = [
  {
    key: "customer",
    label: "客户",
    idField: "code",
    sample: "客户编号\t公司名\t国家\t联系人\t信用等级\t账期\n C-DE-002\tBerlin Med GmbH\t德国\tLena Fischer\tB\t30",
    fields: [
      { key: "code", label: "客户编号", aliases: ["编号", "code", "customercode", "客户代码"], required: true, hint: "判重就看它" },
      { key: "name", label: "公司名", aliases: ["客户名称", "company", "customername", "名称"], required: true },
      { key: "country", label: "国家", aliases: ["country", "目的国", "国别"] },
      { key: "contact", label: "联系人", aliases: ["contact", "contactperson", "对接人"] },
      { key: "creditLevel", label: "信用等级", aliases: ["credit", "等级", "级别"], hint: "A / B / C" },
      { key: "termDays", label: "账期天数", aliases: ["term", "termdays", "账期", "付款账期"], hint: "0 = 款到发货" },
      { key: "sinosureLimit", label: "中信保限额", aliases: ["limit", "额度", "保额"], hint: "美元" },
    ],
  },
  {
    key: "product",
    label: "产品",
    idField: "sku",
    sample: "SKU\t品名\t英文名\tHS编码\t退税率\t单位\t每箱数量\n PPE-NEW-01\t医用防护面罩\tMedical face mask\t3926909090\t13\t件\t200",
    fields: [
      { key: "sku", label: "SKU", aliases: ["编码", "货号", "productcode", "料号"], required: true, hint: "判重就看它" },
      { key: "name", label: "品名", aliases: ["产品名称", "name", "productname"], required: true },
      { key: "nameEn", label: "英文名", aliases: ["englishname", "nameen", "英文品名"], hint: "单据上打的是它" },
      { key: "category", label: "品类", aliases: ["category", "分类"] },
      { key: "hsCode", label: "HS 编码", aliases: ["hs", "hscode", "海关编码"] },
      { key: "refundRate", label: "退税率", aliases: ["refund", "退税", "退税率%"], hint: "填 13 表示 13%" },
      { key: "unit", label: "单位", aliases: ["unit", "计量单位"] },
      { key: "lastCost", label: "采购价", aliases: ["cost", "成本", "采购单价"], hint: "人民币" },
      { key: "packQty", label: "每箱数量", aliases: ["pack", "装箱量", "packqty"] },
    ],
  },
  {
    key: "supplier",
    label: "供应商",
    idField: "code",
    sample: "供应商编号\t名称\t品类\t联系人\t电话\t省份\t账期\n S-009\t福建益民无纺布\t防护用品\t张伟\t0591-8888xxx\t福建\t30",
    fields: [
      { key: "code", label: "供应商编号", aliases: ["编号", "code", "suppliercode"], required: true, hint: "判重就看它" },
      { key: "name", label: "名称", aliases: ["供应商名称", "name", "公司名"], required: true },
      { key: "category", label: "品类", aliases: ["category", "分类", "供货品类"] },
      { key: "contact", label: "联系人", aliases: ["contact", "对接人"] },
      { key: "phone", label: "电话", aliases: ["phone", "tel", "联系电话"] },
      { key: "province", label: "省份", aliases: ["province", "地区"] },
      { key: "termDays", label: "账期天数", aliases: ["term", "termdays", "账期"] },
    ],
  },
];

type Plan = {
  create: number;
  update: number;
  skip: Array<{ row: number; why: string }>;
  preview: Array<{ row: number; action: "create" | "update"; label: string; detail: string }>;
};

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export function ImportWizard({
  open,
  onClose,
  initialTarget,
}: {
  open: boolean;
  onClose: () => void;
  /** 从档案页的空状态直接跳进来时，落在对应的那张表上，省一次选择 */
  initialTarget?: string;
}) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const [targetKey, setTargetKey] = useState(initialTarget ?? "customer");
  const [text, setText] = useState("");
  const [map, setMap] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);

  const target = TARGETS.find((x) => x.key === targetKey)!;
  const table = useMemo(() => parseTable(text), [text]);

  // 表头一变就重猜，除非用户已经手工改过映射
  const mapping = useMemo(() => {
    if (touched) return map;
    return guessMapping(table.headers, target.fields);
  }, [table.headers, target.fields, touched, map]);

  const col = (row: string[], key: string) => {
    const i = mapping[key];
    return i === undefined ? undefined : row[i]?.trim();
  };

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    if (targetKey === "customer") for (const c of db.customers) set.add(c.code.toLowerCase());
    if (targetKey === "product") for (const p of db.ops.products) set.add(p.sku.toLowerCase());
    if (targetKey === "supplier") for (const s of db.ops.suppliers) set.add(s.code.toLowerCase());
    return set;
  }, [db, targetKey]);

  /** 试运行。不写任何东西，只算出「会发生什么」 */
  const plan = useMemo((): Plan => {
    const out: Plan = { create: 0, update: 0, skip: [], preview: [] };
    const seen = new Set<string>();
    table.rows.forEach((row, i) => {
      const idRaw = col(row, target.idField);
      const missing = target.fields.filter((f) => f.required && !col(row, f.key));
      if (missing.length) {
        out.skip.push({ row: i + 2, why: t("缺 {f}", { f: missing.map((m) => t(m.label)).join("、") }) });
        return;
      }
      const id = idRaw!.toLowerCase();
      if (seen.has(id)) {
        // 同一份表里重复：只认第一条，后面的跳过并说清楚
        out.skip.push({ row: i + 2, why: t("这份表里 {id} 出现了不止一次", { id: idRaw! }) });
        return;
      }
      seen.add(id);
      const isUpdate = existingKeys.has(id);
      if (isUpdate) out.update++;
      else out.create++;
      if (out.preview.length < 8) {
        out.preview.push({
          row: i + 2,
          action: isUpdate ? "update" : "create",
          label: `${idRaw} · ${col(row, "name") ?? ""}`,
          detail: target.fields
            .filter((f) => f.key !== target.idField && f.key !== "name" && col(row, f.key))
            .map((f) => `${t(f.label)} ${col(row, f.key)}`)
            .join(" · "),
        });
      }
    });
    return out;
  }, [table, mapping, existingKeys, target, t]);

  const run = () => {
    const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
    let created = 0;
    let updated = 0;
    const seen = new Set<string>();
    const now = new Date().toISOString();

    mutate((d) => {
      for (const row of table.rows) {
        const idRaw = col(row, target.idField);
        if (!idRaw) continue;
        if (target.fields.some((f) => f.required && !col(row, f.key))) continue;
        const id = idRaw.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);

        if (targetKey === "customer") {
          const idx = d.customers.findIndex((c) => c.code.toLowerCase() === id);
          const patch: Partial<Customer> = {
            code: idRaw,
            name: col(row, "name")!,
            country: col(row, "country") ?? "—",
            contact: col(row, "contact") ?? null,
            creditLevel: (col(row, "creditLevel") ?? "B").toUpperCase().slice(0, 1),
            termDays: toNumber(col(row, "termDays")) ?? 30,
            sinosureLimitCents: Math.round((toNumber(col(row, "sinosureLimit")) ?? 0) * 100),
            updatedAt: now,
          };
          if (idx >= 0) {
            d.customers = d.customers.map((c, i) => (i === idx ? { ...c, ...patch } : c));
            updated++;
          } else {
            d.customers = [
              ...d.customers,
              {
                id: rid("cus"),
                sinosureUsedCents: 0,
                currency: "USD",
                timezone: null,
                note: null,
                active: true,
                salesId: user?.id ?? null,
                createdAt: now,
                ...patch,
              } as Customer,
            ];
            created++;
          }
        } else if (targetKey === "product") {
          const idx = d.ops.products.findIndex((p) => p.sku.toLowerCase() === id);
          const patch: Partial<Product> = {
            sku: idRaw,
            name: col(row, "name")!,
            nameEn: col(row, "nameEn") || undefined,
            category: col(row, "category") ?? "未分类",
            hsCode: col(row, "hsCode") ?? "",
            refundRateBp: Math.round((toNumber(col(row, "refundRate")) ?? 13) * 100),
            unit: col(row, "unit") ?? "pcs",
            lastCostCents: Math.round((toNumber(col(row, "lastCost")) ?? 0) * 100),
            packQty: toNumber(col(row, "packQty")) ?? 0,
          };
          if (idx >= 0) {
            d.ops = { ...d.ops, products: d.ops.products.map((p, i) => (i === idx ? { ...p, ...patch } : p)) };
            updated++;
          } else {
            d.ops = {
              ...d.ops,
              products: [...d.ops.products, { id: rid("prd"), grossWeightG: 0, volumeCm3: 0, active: true, note: null, ...patch } as Product],
            };
            created++;
          }
        } else {
          const idx = d.ops.suppliers.findIndex((s) => s.code.toLowerCase() === id);
          const patch: Partial<Supplier> = {
            code: idRaw,
            name: col(row, "name")!,
            category: col(row, "category") ?? "未分类",
            contact: col(row, "contact") ?? null,
            phone: col(row, "phone") ?? null,
            province: col(row, "province") ?? "—",
            termDays: toNumber(col(row, "termDays")) ?? 30,
          };
          if (idx >= 0) {
            d.ops = { ...d.ops, suppliers: d.ops.suppliers.map((s, i) => (i === idx ? { ...s, ...patch } : s)) };
            updated++;
          } else {
            d.ops = {
              ...d.ops,
              suppliers: [...d.ops.suppliers, { id: rid("sup"), score: 80, certExpiry: null, taxNo: null, bank: null, active: true, note: null, createdAt: now, ...patch } as Supplier],
            };
            created++;
          }
        }
      }
      pushAudit(d, {
        actorId: actor.id,
        actorName: actor.name,
        entity: "Import",
        entityId: targetKey,
        entityLabel: t(target.label),
        action: "批量导入",
        before: null,
        after: JSON.stringify({ 新增: created, 更新: updated }),
      });
    });

    toast(t("导入完成：新增 {c} 条，更新 {u} 条", { c: created, u: updated }));
    setText("");
    setTouched(false);
    onClose();
  };

  const ready = table.rows.length > 0 && target.fields.filter((f) => f.required).every((f) => mapping[f.key] !== undefined);

  return (
    <Modal
      open={open}
      title={t("导入数据")}
      width={820}
      onClose={onClose}
      footer={
        <>
          <span className="muted">
            {table.rows.length ? t("读到 {n} 行", { n: table.rows.length }) : t("还没有数据")}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="btn btn-primary" disabled={!ready || plan.create + plan.update === 0} onClick={run}>
            {t("确认导入 {n} 条", { n: plan.create + plan.update })}
          </button>
        </>
      }
    >
      <div className="imp">
        <div className="imp-step">
          <span className="imp-n">1</span>
          <div>
            <b>{t("导什么")}</b>
            <Segmented value={targetKey} onChange={setTargetKey} options={TARGETS.map((x) => ({ value: x.key, label: t(x.label) }))} label={t("导入目标")} />
          </div>
        </div>

        <div className="imp-step">
          <span className="imp-n">2</span>
          <div>
            <b>{t("从 Excel 里选中一片，直接粘到这里")}</b>
            <small>{t("第一行要是表头。也可以选一个 .csv 文件 —— 但粘贴更快，不用先另存为。")}</small>
            <textarea
              className="input imp-paste"
              rows={5}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTouched(false);
              }}
              placeholder={target.sample}
              aria-label={t("粘贴数据")}
            />
            <div className="row" style={{ gap: 8 }}>
              <label className="btn btn-sm">
                <Icon name="upload" size={13} />
                {t("选 .csv 文件")}
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setText(await f.text());
                      setTouched(false);
                    } catch {
                      toastError(t("这个文件读不出来"));
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="link-btn"
                onClick={() => {
                  setText(target.sample.replace(/\n /g, "\n"));
                  setTouched(false);
                }}
              >
                {t("填一行示例看看")}
              </button>
            </div>
          </div>
        </div>

        {table.headers.length ? (
          <div className="imp-step">
            <span className="imp-n">3</span>
            <div>
              <b>{t("对一下字段")}</b>
              <small>{t("系统按表头猜的，猜错了在这里改。带 * 的必须有。")}</small>
              <div className="imp-map">
                {target.fields.map((f) => (
                  <label key={f.key} className="imp-field" data-miss={f.required && mapping[f.key] === undefined ? "1" : undefined}>
                    <span>
                      {t(f.label)}
                      {f.required ? <i className="req">*</i> : null}
                      {f.hint ? <i className="imp-hint">{t(f.hint)}</i> : null}
                    </span>
                    <select
                      className="select select-xs"
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => {
                        setTouched(true);
                        setMap({ ...mapping, [f.key]: e.target.value === "" ? undefined! : Number(e.target.value) });
                      }}
                      aria-label={t(f.label)}
                    >
                      <option value="">{t("不导入")}</option>
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || t("第 {n} 列", { n: i + 1 })}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {table.rows.length ? (
          <div className="imp-step">
            <span className="imp-n">4</span>
            <div>
              <b>{t("试运行 —— 确认前先看清楚要发生什么")}</b>
              <div className="imp-plan">
                <Pill tone="jade" dot={false}>
                  {t("新增 {n}", { n: plan.create })}
                </Pill>
                <Pill tone="accent" dot={false}>
                  {t("更新 {n}", { n: plan.update })}
                </Pill>
                {plan.skip.length ? (
                  <Pill tone="amber" dot={false}>
                    {t("跳过 {n}", { n: plan.skip.length })}
                  </Pill>
                ) : null}
                {/* 更新是按编号判重的，用户必须知道"更新"意味着覆盖 */}
                {plan.update > 0 ? <span className="muted">{t("编号已存在的会被覆盖，不是新建一条")}</span> : null}
              </div>

              <ul className="imp-preview">
                {plan.preview.map((p) => (
                  <li key={p.row}>
                    <Pill tone={p.action === "create" ? "jade" : "accent"} dot={false}>
                      {p.action === "create" ? t("新增") : t("更新")}
                    </Pill>
                    <b className="truncate">{p.label}</b>
                    <span className="truncate muted">{p.detail}</span>
                  </li>
                ))}
                {plan.create + plan.update > plan.preview.length ? (
                  <li className="muted">{t("…还有 {n} 条", { n: plan.create + plan.update - plan.preview.length })}</li>
                ) : null}
              </ul>

              {plan.skip.length ? (
                <ul className="imp-skip">
                  {plan.skip.slice(0, 5).map((s) => (
                    <li key={s.row}>
                      <Icon name="alert" size={12} />
                      {t("第 {n} 行", { n: s.row })} — {s.why}
                    </li>
                  ))}
                  {plan.skip.length > 5 ? <li className="muted">{t("…还有 {n} 行被跳过", { n: plan.skip.length - 5 })}</li> : null}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

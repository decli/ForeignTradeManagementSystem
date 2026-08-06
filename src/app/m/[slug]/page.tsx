import { notFound } from "next/navigation";
import { findNavItem } from "@/lib/nav";

export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = findNavItem(slug);
  if (!item) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{item.title}</h1>
          <p>规划中 · 尚未开发</p>
        </div>
      </div>
      <div className="card">
        <div className="card-b soon">
          <span className="pill violet plain">规划中</span>
          <h2>{item.title}</h2>
          <p>
            {item.desc ??
              "该模块沿用同一套设计系统：筛选条 → KPI 带 → 数据表 → 抽屉详情，交互与跟单表一致。"}
          </p>
          <div className="scope">
            {(item.scope ?? ["列表与筛选", "详情抽屉", "Excel 导入导出", "操作留痕"]).map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

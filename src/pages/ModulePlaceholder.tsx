import { Link, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { findNavItem, groupOf, NAV, navHref } from "@/lib/nav";

/**
 * 未开发模块的占位页。
 *
 * 写清楚「这个模块是干嘛的、包含哪些功能、排在第几期」，比放一句「敬请期待」
 * 有用得多 —— 演示给客户看的时候，这 25 个页面本身就是产品范围说明书。
 */
export default function ModulePlaceholder() {
  const { slug = "" } = useParams();
  const item = findNavItem(slug);
  const group = groupOf(slug);

  if (!item) {
    return (
      <div className="page">
        <div className="empty">
          <span className="empty-mark">
            <Icon name="search" />
          </span>
          <h3>没有这个模块</h3>
          <p>地址里的 {slug} 不在模块清单里。</p>
          <Link className="btn" to="/dashboard">
            回到数据看板
          </Link>
        </div>
      </div>
    );
  }

  const siblings = group?.items.filter((i) => i.slug !== slug) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span className="tag">{group?.title}</span>
            <span className="pill amber">规划中</span>
          </div>
          <h1>{item.title}</h1>
        </div>
      </div>

      <div className="placeholder">
        <section className="card">
          <div className="card-body" style={{ display: "grid", gap: 16 }}>
            <p style={{ fontSize: "var(--fs-lg)", lineHeight: 1.7 }}>{item.desc ?? "这个模块的定位还在梳理中。"}</p>

            {item.scope?.length ? (
              <div>
                <div className="sect-h" style={{ marginBottom: 8 }}>
                  <Icon name="target" size={14} />
                  功能范围
                </div>
                <div className="ph-scope">
                  {item.scope.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 10,
                padding: 12,
                background: "var(--surface-2)",
                borderRadius: "var(--r-md)",
                fontSize: "var(--fs-md)",
                color: "var(--text-2)",
              }}
            >
              <Icon name="info" size={16} style={{ color: "var(--text-3)", marginTop: 2, flex: "none" }} />
              <span>
                当前演示版已把<b>跟单表、订单核算、退税管理、客户管理、PI 取号、数据看板、审计日志</b>接上了真实数据流；
                这个模块的数据模型已经在 schema 里预留，界面按排期推进。
              </span>
            </div>
          </div>
        </section>

        {siblings.length ? (
          <section className="card">
            <div className="card-head">
              <h3>{group?.title}下的其他模块</h3>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 2, paddingBlock: 6 }}>
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  to={navHref(s)}
                  className="row"
                  style={{ padding: "9px 0", borderBottom: "1px solid var(--line-2)", color: "inherit" }}
                >
                  <b style={{ fontSize: "var(--fs-md)", fontWeight: 550 }}>{s.title}</b>
                  {s.built ? <span className="pill jade">已接数据</span> : null}
                  <span className="spacer" />
                  <span className="muted truncate" style={{ fontSize: "var(--fs-sm)", maxWidth: 340 }}>
                    {s.desc ?? ""}
                  </span>
                  <Icon name="chevronRight" size={14} style={{ color: "var(--text-4)" }} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h3>已经能用的模块</h3>
          </div>
          <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {NAV.flatMap((g) => g.items)
              .filter((i) => i.built)
              .map((i) => (
                <Link key={i.slug} className="btn btn-sm" to={navHref(i)}>
                  {i.icon ? <Icon name={i.icon} /> : null}
                  {i.title}
                </Link>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

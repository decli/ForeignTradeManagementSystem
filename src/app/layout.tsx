import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { rateFromE6 } from "@/lib/format";

export const metadata: Metadata = {
  title: "MT 通商 · TRADEFLOW",
  description: "外贸业务管理系统：跟单、订单核算、退税、资金",
};

/** 主题在 CSS 里就绪，这段只是把用户上次的选择在首帧前贴回 <html>，避免闪一下 */
const THEME_BOOT = `try{var t=localStorage.getItem('tf-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

async function getFx() {
  const [market, custom] = await Promise.all([
    db.fxRate.findFirst({ where: { kind: "market" }, orderBy: { asOf: "desc" } }),
    db.fxRate.findFirst({ where: { kind: "custom" }, orderBy: { asOf: "desc" } }),
  ]);
  const asOf = market?.asOf ?? new Date();
  return {
    market: rateFromE6(market?.rateE6 ?? 6_739_200),
    custom: rateFromE6(custom?.rateE6 ?? 6_700_000),
    asOf: `${String(asOf.getMonth() + 1).padStart(2, "0")}/${String(asOf.getDate()).padStart(2, "0")}`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const fx = await getFx();
  // TODO(M1): 接入登录后从 session 取当前用户
  const admin = await db.user.findFirst({ where: { role: "admin" } });
  const user = {
    name: admin?.name ?? "未登录",
    role: "管理员",
    scope: "全部数据",
  };

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <AppShell fx={fx} user={user}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

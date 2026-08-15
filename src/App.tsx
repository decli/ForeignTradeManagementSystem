import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { trackPage } from "./lib/analytics";
import { breadcrumb } from "./lib/nav";
import { useAuth } from "./auth/AuthProvider";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FollowUps from "./pages/FollowUps";

// 首屏只需要看板和跟单表，其余按需加载
const Orders = lazy(() => import("./pages/Orders"));
const TaxRefund = lazy(() => import("./pages/TaxRefund"));
const Customers = lazy(() => import("./pages/Customers"));
const PiRegistry = lazy(() => import("./pages/PiRegistry"));
const Audit = lazy(() => import("./pages/Audit"));
const Settings = lazy(() => import("./pages/Settings"));
const ModulePlaceholder = lazy(() => import("./pages/ModulePlaceholder"));
// 采购协同五个模块打一个包：采购的人进来往往连着看
const Suppliers = lazy(() => import("./pages/sourcing").then((m) => ({ default: m.Suppliers })));
const Products = lazy(() => import("./pages/sourcing").then((m) => ({ default: m.Products })));
const Rfqs = lazy(() => import("./pages/sourcing").then((m) => ({ default: m.Rfqs })));
const Contracts = lazy(() => import("./pages/sourcing").then((m) => ({ default: m.Contracts })));
const Productions = lazy(() => import("./pages/sourcing").then((m) => ({ default: m.Productions })));

// 售前三页打一个包：业务员进来是连着看的 —— 处理询盘、开报价、顺手寄个样
const Inquiries = lazy(() => import("./pages/presales").then((m) => ({ default: m.Inquiries })));
const Quotes = lazy(() => import("./pages/presales").then((m) => ({ default: m.Quotes })));
const SamplesPage = lazy(() => import("./pages/presales").then((m) => ({ default: m.Samples })));
const Approvals = lazy(() => import("./pages/approvals"));
const Receivables = lazy(() => import("./pages/receivables"));

const Payments = lazy(() => import("./pages/finance").then((m) => ({ default: m.Payments })));
const Funds = lazy(() => import("./pages/finance").then((m) => ({ default: m.Funds })));
const BankJournal = lazy(() => import("./pages/finance").then((m) => ({ default: m.BankJournal })));
const AccountsPage = lazy(() => import("./pages/finance").then((m) => ({ default: m.Accounts })));
const Expenses = lazy(() => import("./pages/finance").then((m) => ({ default: m.Expenses })));
const Sinosure = lazy(() => import("./pages/finance").then((m) => ({ default: m.Sinosure })));

const Inventory = lazy(() => import("./pages/logistics").then((m) => ({ default: m.Inventory })));
const Freight = lazy(() => import("./pages/logistics").then((m) => ({ default: m.Freight })));
const Documents = lazy(() => import("./pages/logistics").then((m) => ({ default: m.Documents })));

const SellerEntities = lazy(() => import("./pages/admin").then((m) => ({ default: m.SellerEntities })));
const InvoiceInfo = lazy(() => import("./pages/admin").then((m) => ({ default: m.InvoiceInfo })));
const Commission = lazy(() => import("./pages/admin").then((m) => ({ default: m.Commission })));
const Reports = lazy(() => import("./pages/admin").then((m) => ({ default: m.Reports })));
const Logins = lazy(() => import("./pages/admin").then((m) => ({ default: m.Logins })));

function PageFallback() {
  return (
    <div className="page">
      <div className="skel" style={{ height: 30, width: 200, marginBottom: 18 }} />
      <div className="skel" style={{ height: 64, marginBottom: 14 }} />
      <div className="skel" style={{ height: 380 }} />
    </div>
  );
}

/**
 * 路由变化时报一次 page_view。
 *
 * gtag 只在脚本加载那一刻自动报一次，之后在 33 个模块之间来回切它一无所知 ——
 * 不补这一段，GA 上看到的就是「平均每次会话 1 个页面」，而这个数字恰恰是
 * 我们最想弄清楚的那个（访客到底翻了几个模块）。
 *
 * 只报 pathname，不带 search：筛选条件、抽屉里打开的是哪一单，都不是「页面」，
 * 也不该把单据号送进 GA（见 analytics.ts 第 3 条）。
 */
function usePageTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    const { group, title } = breadcrumb(pathname);
    trackPage(pathname, pathname === "/login" ? "登录" : `${group} / ${title}`);
  }, [pathname]);
}

export default function App() {
  const { session, user } = useAuth();
  const location = useLocation();
  const signedIn = !!session && !!user;
  usePageTracking();

  if (!signedIn) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/follow-ups" element={<FollowUps />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/my-orders" element={<Orders mine />} />
          <Route path="/tax-refund" element={<TaxRefund />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/pi" element={<PiRegistry />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/samples" element={<SamplesPage />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/rfq" element={<Rfqs />} />
          <Route path="/purchase-contract" element={<Contracts />} />
          <Route path="/production" element={<Productions />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/funds" element={<Funds />} />
          <Route path="/bank-journal" element={<BankJournal />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/sinosure" element={<Sinosure />} />
          <Route path="/stock" element={<Inventory />} />
          <Route path="/freight" element={<Freight />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/seller-entities" element={<SellerEntities />} />
          <Route path="/invoice-info" element={<InvoiceInfo />} />
          <Route path="/commission" element={<Commission />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/logins" element={<Logins />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/m/:slug" element={<ModulePlaceholder />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

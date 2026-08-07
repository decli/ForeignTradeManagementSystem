import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
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

export default function App() {
  const { session, user } = useAuth();
  const location = useLocation();
  const signedIn = !!session && !!user;

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

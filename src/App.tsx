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
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/m/:slug" element={<ModulePlaceholder />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

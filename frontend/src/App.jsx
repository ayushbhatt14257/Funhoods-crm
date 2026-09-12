import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './features/auth/Login';
import Dashboard from './features/dashboard/Dashboard';
import Products from './features/products/Products';
import ProductDetail from './features/products/ProductDetail';
import Dealers from './features/dealers/Dealers';
import DealerDetail from './features/dealers/DealerDetail';
import Aliases from './features/aliases/Aliases';
import NewOrder from './features/pi/NewOrder';
import PIList from './features/pi/PIList';
import Pipeline from './features/pi/Pipeline';
import PendingApprovals from './features/pi/PendingApprovals';
import PIDetail from './features/pi/PIDetail';
import Dispatch from './features/dispatch/Dispatch';
import Invoices from './features/invoices/Invoices';
import InvoiceDetail from './features/invoices/InvoiceDetail';
import Inventory from './features/inventory/Inventory';
import GenerateBarcodes from './features/inventory/GenerateBarcodes';
import ScanStockIn from './features/inventory/ScanStockIn';
import Outstanding from './features/ledger/Outstanding';
import SettingsPage from './features/settings/Settings';
import Users from './features/users/Users';
import Profile from './features/users/Profile';
import Notifications from './features/notifications/Notifications';
import Import from './features/import/Import';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Delivery role only deals with dispatched orders — send them straight to
// Tax Invoices instead of the full dashboard, which they have no nav link to anyway.
function Home() {
  const { user } = useAuth();
  if (user?.role === 'delivery') return <Navigate to="/invoices" replace />;
  return <Dashboard />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="new-order" element={<NewOrder />} />
        <Route path="pis" element={<PIList />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="approvals" element={<PendingApprovals />} />
        <Route path="pis/:no" element={<PIDetail />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:no" element={<InvoiceDetail />} />
        <Route path="dealers" element={<Dealers />} />
        <Route path="dealers/:code" element={<DealerDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:code" element={<ProductDetail />} />
        <Route path="aliases" element={<Aliases />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="generate-barcodes" element={<GenerateBarcodes />} />
        <Route path="stock-in" element={<ScanStockIn />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="import" element={<Import />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<Users />} />
        <Route path="profile" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

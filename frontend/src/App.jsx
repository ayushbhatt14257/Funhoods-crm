import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Dealers from './pages/Dealers';
import Aliases from './pages/Aliases';
import NewOrder from './pages/NewOrder';
import PIList from './pages/PIList';
import PIDetail from './pages/PIDetail';
import Dispatch from './pages/Dispatch';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Inventory from './pages/Inventory';
import SettingsPage from './pages/Settings';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import Import from './pages/Import';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
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
        <Route index element={<Dashboard />} />
        <Route path="new-order" element={<NewOrder />} />
        <Route path="pis" element={<PIList />} />
        <Route path="pis/:no" element={<PIDetail />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:no" element={<InvoiceDetail />} />
        <Route path="dealers" element={<Dealers />} />
        <Route path="products" element={<Products />} />
        <Route path="aliases" element={<Aliases />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="import" element={<Import />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<Users />} />
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

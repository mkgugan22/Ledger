import { Outlet } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import TopNavbar from "./TopNavbar.jsx";

export default function Layout({ apiError, user, theme, onThemeToggle, onLogout }) {
  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <div className="d-none d-lg-flex">
        <Sidebar user={user} theme={theme} onThemeToggle={onThemeToggle} onLogout={onLogout} />
      </div>

      <div className="flex-grow-1 min-w-0">
        <div className="d-lg-none">
          <TopNavbar user={user} theme={theme} onThemeToggle={onThemeToggle} onLogout={onLogout} />
        </div>

        <main>
          <div className="container-xl py-4 py-lg-5">
            {apiError && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mb-3">
                <AlertCircle size={16} />
                <small>{apiError}</small>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

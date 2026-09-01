import { Outlet } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import TopNavbar from "./TopNavbar.jsx";
import AnimatedBackground from "../../lib/motion/AnimatedBackground.jsx";
import PageTransition from "../../lib/motion/PageTransition.jsx";

export default function Layout({ apiError, user, theme, onThemeToggle, onLogout }) {
  return (
    <div className="d-flex" style={{ minHeight: "100vh", position: "relative" }}>
      <AnimatedBackground />

      <div className="d-none d-lg-flex" style={{ position: "relative", zIndex: 1 }}>
        <Sidebar user={user} theme={theme} onThemeToggle={onThemeToggle} onLogout={onLogout} />
      </div>

      <div className="flex-grow-1 min-w-0" style={{ position: "relative", zIndex: 1 }}>
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
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}

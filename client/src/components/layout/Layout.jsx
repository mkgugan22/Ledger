import { Outlet } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import TopNavbar from "./TopNavbar.jsx";
import AnimatedBackground from "../../lib/motion/AnimatedBackground.jsx";
import PageTransition from "../../lib/motion/PageTransition.jsx";
import InteractiveLedgerCompanion from "../../lib/motion/InteractiveLedgerCompanion.jsx";

export default function Layout({
  apiError,
  user,
  theme,
  onThemeToggle,
  onLogout,
}) {
  return (
    <div
      className="d-flex"
      style={{
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Existing animated background — unchanged */}
      <AnimatedBackground />

      {/* Existing desktop sidebar — unchanged */}
      <div
        className="d-none d-lg-flex"
        style={{
          position: "relative",
          zIndex: 1,
        }}
      >
        <Sidebar
          user={user}
          theme={theme}
          onThemeToggle={onThemeToggle}
          onLogout={onLogout}
        />
      </div>

      {/* Existing main application area — unchanged */}
      <div
        className="flex-grow-1 min-w-0"
        style={{
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Existing mobile navbar — unchanged */}
        <div className="d-lg-none">
          <TopNavbar
            user={user}
            theme={theme}
            onThemeToggle={onThemeToggle}
            onLogout={onLogout}
          />
        </div>

        <main>
          <div className="container-xl py-4 py-lg-5">
            {apiError && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mb-3">
                <AlertCircle size={16} />
                <small>{apiError}</small>
              </div>
            )}

            {/* Existing page transition — unchanged */}
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      {/*
       * ============================================================
       * INTERACTIVE LEDGER COMPANION
       * ============================================================
       *
       * This is intentionally mounted OUTSIDE the application
       * content flow.
       *
       * It uses position: fixed and pointer-events: none.
       *
       * Therefore:
       *
       *   - it does not consume layout space
       *   - it does not move cards
       *   - it does not move tables
       *   - it does not affect Bootstrap rows/columns
       *   - it does not cover or disable buttons
       *   - it does not alter forms
       *   - it does not alter API functionality
       *   - it does not alter routing
       *
       * The component listens globally for input interactions and
       * reacts automatically on every page.
       *
       * Existing page components do NOT need to be modified.
       * ============================================================
       */}
      <InteractiveLedgerCompanion />
    </div>
  );
}

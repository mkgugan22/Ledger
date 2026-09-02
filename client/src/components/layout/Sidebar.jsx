import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Landmark, Menu, BookOpen, PlusCircle, List, PiggyBank,
  TrendingUp, Sun, Moon, LogOut, Target, Sparkles,
} from "lucide-react";
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: BookOpen, end: true },
  { to: "/add", label: "Add Entry", icon: PlusCircle },
  { to: "/entries", label: "All Entries", icon: List },
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/savings", label: "Savings Tracker", icon: PiggyBank },
  { to: "/sip-growth", label: "SIP Growth", icon: TrendingUp },
  { to: "/ledger-ai", label: "Ledger AI", icon: Sparkles },
];
export default function Sidebar({ user, theme, onThemeToggle, onLogout }) {
  return (
    <aside className="lg-sidebar d-flex flex-column p-3">
      <div className="d-flex align-items-center gap-2 px-1 pb-4">
        <Landmark size={22} color="var(--lg-brass)" />
        <div>
          <div className="font-serif lg-brand-title">Ledger</div>
          <div className="lg-brand-sub">your household book</div>
        </div>
      </div>

      <nav className="d-flex flex-column gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `lg-nav-link text-decoration-none position-relative${isActive ? " active" : ""}`}
            style={{ overflow: "hidden" }}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="lg-nav-active-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 8,
                      background: "currentColor",
                      opacity: 0.14,
                      zIndex: 0,
                    }}
                  />
                )}
                <motion.span
                  whileHover={{ x: 3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </motion.span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto d-flex flex-column gap-2">
        <div className="d-flex align-items-center justify-content-between px-2 small text-white-50">
          <span>{user?.name || user?.email}</span>
          <button className="btn btn-sm btn-link text-white-50 p-1" onClick={onLogout} title="Sign out"><LogOut size={14} /></button>
        </div>
        <button className="lg-theme-toggle" onClick={onThemeToggle}>{theme === "light" ? <Moon size={14} /> : <Sun size={14} />} {theme === "light" ? "Dark mode" : "Light mode"}</button>
        <div className="lg-fold-line" />
        <span className="lg-sidebar-foot">
          Entries are saved to your database and stay put between visits.
        </span>
      </div>
    </aside>
  );
}

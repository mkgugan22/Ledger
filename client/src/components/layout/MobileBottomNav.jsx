import { NavLink } from "react-router-dom";
import { BookOpen, List, Plus, Target, Sparkles } from "lucide-react";
import "./MobileBottomNav.css";

// Phone-only shortcut bar. The full menu stays in the top bar's drawer, so
// nothing is removed; this just puts the most-used pages (and Add Entry) one
// tap away. Hidden from the `lg` breakpoint up, where the sidebar is shown.
const LEFT = [
  { to: "/", label: "Home", icon: BookOpen, end: true },
  { to: "/entries", label: "Entries", icon: List },
];
const RIGHT = [
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/ledger-ai", label: "AI", icon: Sparkles },
];

function Tab({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `lg-bottom-tab${isActive ? " active" : ""}`}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function MobileBottomNav() {
  return (
    <nav className="lg-bottom-nav d-lg-none" aria-label="Quick navigation">
      {LEFT.map((item) => <Tab key={item.to} {...item} />)}
      <NavLink to="/add" className={({ isActive }) => `lg-bottom-add${isActive ? " active" : ""}`} aria-label="Add entry">
        <Plus size={26} aria-hidden="true" />
      </NavLink>
      {RIGHT.map((item) => <Tab key={item.to} {...item} />)}
    </nav>
  );
}

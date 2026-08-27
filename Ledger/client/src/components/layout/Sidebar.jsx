import { NavLink } from "react-router-dom";
import { Landmark, BookOpen, PlusCircle, List, PiggyBank } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: BookOpen, end: true },
  { to: "/add", label: "Add Entry", icon: PlusCircle },
  { to: "/entries", label: "All Entries", icon: List },
  { to: "/savings", label: "Savings Tracker", icon: PiggyBank },
];

export default function Sidebar() {
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
            className={({ isActive }) => `lg-nav-link text-decoration-none${isActive ? " active" : ""}`}
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto d-flex flex-column gap-2">
        <div className="lg-fold-line" />
        <span className="lg-sidebar-foot">
          Entries are saved to your database and stay put between visits.
        </span>
      </div>
    </aside>
  );
}

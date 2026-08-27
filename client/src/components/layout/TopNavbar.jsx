import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Navbar, Container, Offcanvas } from "react-bootstrap";
import { Landmark, Menu, BookOpen, PlusCircle, List, PiggyBank, TrendingUp, Sun, Moon, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: BookOpen, end: true },
  { to: "/add", label: "Add Entry", icon: PlusCircle },
  { to: "/entries", label: "All Entries", icon: List },
  { to: "/savings", label: "Savings Tracker", icon: PiggyBank },
  { to: "/sip-growth", label: "SIP Growth", icon: TrendingUp },
];

export default function TopNavbar({ user, theme, onThemeToggle, onLogout }) {
  const [show, setShow] = useState(false);
  const location = useLocation();
  const current = NAV_ITEMS.find((n) =>
    n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)
  );

  return (
    <Navbar className="lg-topbar px-3 py-2" variant="dark" sticky="top">
      <Container fluid className="px-0 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2 text-white">
          <Landmark size={18} color="var(--lg-brass)" />
          <span className="font-serif fw-semibold">Ledger</span>
        </div>
        <button
          className="btn btn-sm d-flex align-items-center gap-2"
          style={{ background: "rgba(247,242,228,0.1)", color: "#F7F2E4", border: "none" }}
          onClick={() => setShow(true)}
        >
          {current?.label || "Menu"}
          <Menu size={16} />
        </button>
      </Container>

      <Offcanvas show={show} onHide={() => setShow(false)} placement="end" className="lg-offcanvas">
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title className="font-serif">Ledger</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setShow(false)}
              className={({ isActive }) => `lg-nav-link text-decoration-none${isActive ? " active" : ""}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
          <div className="mt-auto pt-3 border-top border-secondary-subtle">
            <div className="small text-white-50 mb-2">{user?.name || user?.email}</div>
            <button className="lg-theme-toggle w-100 mb-2" onClick={onThemeToggle}>{theme === "light" ? <Moon size={14} /> : <Sun size={14} />} {theme === "light" ? "Dark mode" : "Light mode"}</button>
            <button className="btn btn-sm btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2" onClick={onLogout}><LogOut size={14} /> Sign out</button>
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </Navbar>
  );
}

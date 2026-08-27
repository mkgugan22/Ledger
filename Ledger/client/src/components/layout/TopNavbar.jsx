import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Navbar, Container, Offcanvas } from "react-bootstrap";
import { Landmark, Menu, BookOpen, PlusCircle, List, PiggyBank } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: BookOpen, end: true },
  { to: "/add", label: "Add Entry", icon: PlusCircle },
  { to: "/entries", label: "All Entries", icon: List },
  { to: "/savings", label: "Savings Tracker", icon: PiggyBank },
];

export default function TopNavbar() {
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
        </Offcanvas.Body>
      </Offcanvas>
    </Navbar>
  );
}

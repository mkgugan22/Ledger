import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const SECTIONS = [
  { id: "dashboard-overview", label: "Overview" },
  { id: "dashboard-cash-flow", label: "Cash flow" },
  { id: "dashboard-recent", label: "Recent entries" },
  { id: "dashboard-categories", label: "Categories" },
  { id: "dashboard-insights", label: "Insights" },
];

export default function DashboardSectionNav() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!window.IntersectionObserver) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visibleSections = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
      if (visibleSections[0]) setActiveSection(visibleSections[0].target.id);
    }, { rootMargin: "-16% 0px -68% 0px", threshold: 0 });

    SECTIONS.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  function jumpToSection(id) {
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <nav className="lg-dashboard-section-nav" aria-label="Dashboard sections">
      {SECTIONS.map(({ id, label }) => (
        <motion.button
          key={id}
          type="button"
          className={`lg-dashboard-section-link${activeSection === id ? " active" : ""}`}
          onClick={() => jumpToSection(id)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          aria-current={activeSection === id ? "location" : undefined}
        >
          {activeSection === id && (
            <motion.span
              className="lg-dashboard-section-indicator"
              layoutId="lg-dashboard-section-indicator"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="lg-dashboard-section-label">{label}</span>
        </motion.button>
      ))}
    </nav>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { fadeSlideUp, defaultTransition } from "./variants.js";

// Wraps route content so navigating between pages (Dashboard, Add Entry,
// Entries, Budget, etc.) gets a soft fade/slide instead of an instant swap.
// Purely visual — it renders `children` as-is, so no route, data-fetching,
// or state logic in App.jsx / Layout.jsx needs to change.
export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={fadeSlideUp}
        transition={defaultTransition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

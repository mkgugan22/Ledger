import { AnimatePresence, motion } from "framer-motion";

// A table-safe animated list: the presence manager adds no DOM wrapper, so
// native table semantics and the existing responsive layout stay intact.
export function AnimatedTableRows({ children }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

export function AnimatedTableRow({ children, ...props }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.tr>
  );
}

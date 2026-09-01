import { motion } from "framer-motion";

// Generic hover/tap-interactive entrance wrapper for cards. Purely
// presentational — forwards all other props and children straight through,
// so it can wrap any existing card content without changing what's inside.
//
// Usage:
//   <AnimatedCard delay={0.1} className="lg-summary-card h-100 card">
//     <Card.Body>...</Card.Body>
//   </AnimatedCard>
export default function AnimatedCard({ children, className = "", delay = 0, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      whileHover={{ y: -4, boxShadow: "0 12px 28px rgba(0,0,0,0.14)" }}
      whileTap={{ scale: 0.98 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

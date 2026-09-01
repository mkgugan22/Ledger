import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "./variants.js";

// Wrap a list/grid of items so its children fade+slide in one after
// another instead of all at once. Drop `StaggerList` around the container
// and `StaggerItem` around each child — everything else (data, keys,
// layout classes) stays exactly as it was.
//
// Usage:
//   <StaggerList className="row g-3">
//     {items.map((item) => (
//       <StaggerItem key={item.id} className="col-6 col-lg-3">
//         ...existing card markup...
//       </StaggerItem>
//     ))}
//   </StaggerList>
export function StaggerList({ children, className = "", ...rest }) {
  return (
    <motion.div className={className} initial="initial" animate="animate" variants={staggerContainer} {...rest}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", ...rest }) {
  return (
    <motion.div className={className} variants={staggerItem} transition={{ duration: 0.3, ease: "easeOut" }} {...rest}>
      {children}
    </motion.div>
  );
}

import { useEffect, useRef } from "react";
import { useMotionValue, useTransform, animate } from "framer-motion";
import { motion } from "framer-motion";

// Optional drop-in for count-up number animation, e.g. dashboard totals:
//   <AnimatedNumber value={totals.inHand} formatter={formatCurrency} />
// Not wired into any existing component — purely available to use where
// you want it, without changing current dashboard/budget logic.
export default function AnimatedNumber({ value = 0, formatter = (n) => n, duration = 0.6, className }) {
  const motionVal = useMotionValue(value);
  const rounded = useTransform(motionVal, (v) => formatter(Math.round(v)));
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(motionVal, value, { duration, ease: "easeOut" });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, motionVal]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

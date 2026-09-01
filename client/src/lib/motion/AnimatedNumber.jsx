import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

// Count-up number animation. Renders a <span> whose text ticks smoothly
// from its previous value to the new `value` whenever it changes.
//
// Usage:
//   <AnimatedNumber value={totals.inHand} formatter={fmtINR} />
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

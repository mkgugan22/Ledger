import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";

// Render the initial value without a count-up. Animate only after an actual
// value change, and disable that transition when reduced motion is preferred.
export default function AnimatedNumber({ value = 0, formatter = (n) => n, duration = 0.6, className }) {
  const motionVal = useMotionValue(value);
  const rounded = useTransform(motionVal, (v) => formatter(Math.round(v)));
  const previous = useRef(value);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (Object.is(previous.current, value)) return undefined;
    previous.current = value;
    if (prefersReducedMotion) {
      motionVal.set(value);
      return undefined;
    }
    const controls = animate(motionVal, value, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [value, duration, motionVal, prefersReducedMotion]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

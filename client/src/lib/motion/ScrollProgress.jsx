import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

// A quiet reading-progress line, inspired by the reference's scroll-led page
// journey. It is fixed above the app and never participates in layout.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      aria-hidden="true"
      className="lg-scroll-progress"
      style={{ scaleX: reduceMotion ? scrollYProgress : smoothProgress }}
    />
  );
}

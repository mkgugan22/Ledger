// Shared Framer Motion animation variants used across the app.
// Centralizing these keeps timing/easing consistent and makes it easy
// to tune animations in one place without touching component logic.

export const fadeSlideUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export const cardHover = {
  rest: { scale: 1, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" },
  hover: { scale: 1.015, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" },
};

export const defaultTransition = { duration: 0.25, ease: "easeOut" };

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Drop-in replacement for a plain <button> that adds a Material-style
// ripple on click. Accepts the same props/children as a normal button, so
// swapping <button className="..."> for <RippleButton className="..."> is
// a no-op for everything except the click visual — nothing elsewhere needs
// to change, and plain <button> elements elsewhere in the app are
// unaffected since this is an entirely separate, opt-in component.
export default function RippleButton({ children, className = "", onClick, style, ...rest }) {
  const [ripples, setRipples] = useState([]);

  const handleClick = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = Date.now() + Math.random();
      setRipples((prev) => [...prev, { id, x, y, size }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
      onClick?.(e);
    },
    [onClick]
  );

  return (
    <button
      className={className}
      onClick={handleClick}
      style={{ position: "relative", overflow: "hidden", ...style }}
      {...rest}
    >
      {children}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0.35, scale: 0 }}
            animate={{ opacity: 0, scale: 2.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.size,
              height: r.size,
              borderRadius: "50%",
              background: "currentColor",
              pointerEvents: "none",
            }}
          />
        ))}
      </AnimatePresence>
    </button>
  );
}

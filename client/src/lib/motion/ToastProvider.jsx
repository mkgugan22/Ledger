import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { ToastContext } from "./toastContext.js";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const COLORS = { success: "#2e7d32", error: "#c62828", info: "#0d6efd" };

// Wraps the app once (see main.jsx) and exposes a `useToast()` hook that
// any component can call to pop an animated toast in the bottom-right
// corner — entirely opt-in, nothing existing has to call it.
//
// Usage inside any component:
//   import { useToast } from "../../lib/motion/toastContext.js";
//   const showToast = useToast();
//   showToast("Entry saved", "success");
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--lg-surface, #fff)",
                  color: "var(--lg-text, #1a1a1a)",
                  border: "1px solid var(--lg-rule, #e0e0e0)",
                  borderLeft: `4px solid ${COLORS[t.type] || COLORS.info}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  minWidth: 220,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                  fontSize: 14,
                  pointerEvents: "auto",
                }}
              >
                <Icon size={16} color={COLORS[t.type] || COLORS.info} />
                <span>{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import "./lib/motion/InteractiveLedgerCompanion.css";
import App from "./App.jsx";
import { ToastProvider } from "./lib/motion/ToastProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* Honour the OS "reduce motion" setting for all framer-motion animations. */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <App />
      </ToastProvider>
    </MotionConfig>
  </StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./components/layout/App";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import "./index.css";
import { applyDisplaySettings, getSettings } from "./lib/settings";

// Theme, text size, contrast and motion before first paint (no flash)
applyDisplaySettings(getSettings(), window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

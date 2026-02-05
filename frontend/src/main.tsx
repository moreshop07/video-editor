import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-primary)]">
          <div className="text-[var(--text-secondary)]">Loading...</div>
        </div>
      }
    >
      <App />
    </Suspense>
  </StrictMode>,
);

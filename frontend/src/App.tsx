import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const EditorPage = lazy(() => import("./pages/EditorPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<EditorPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/editor/:projectId" element={<EditorPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

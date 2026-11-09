import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageLoader } from "@/components/common/PageLoader";
import { TooltipProvider } from "@/components/ui/misc";
import { UIProvider } from "@/providers/ui";
import { useSettings } from "@/hooks/data";

const Overview = lazy(() => import("@/pages/Overview"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const WorkLogPage = lazy(() => import("@/pages/WorkLog"));
const DailyReports = lazy(() => import("@/pages/DailyReports"));
const WeeklyReports = lazy(() => import("@/pages/WeeklyReports"));
const CalendarPage = lazy(() => import("@/pages/Calendar"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function ThemedToaster() {
  const { theme } = useSettings();
  return <Toaster theme={theme} position="bottom-right" richColors closeButton toastOptions={{ className: "!rounded-lg" }} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <TooltipProvider>
          <UIProvider>
            <Routes>
              <Route element={<AppShell />}>
                {[
                  ["/", Overview],
                  ["/projects", Projects],
                  ["/projects/:id", ProjectDetail],
                  ["/tasks", Tasks],
                  ["/work-log", WorkLogPage],
                  ["/reports/daily", DailyReports],
                  ["/reports/weekly", WeeklyReports],
                  ["/calendar", CalendarPage],
                  ["/settings", SettingsPage],
                  ["*", NotFound],
                ].map(([path, Comp]) => {
                  const C = Comp as React.ComponentType;
                  return (
                    <Route
                      key={path as string}
                      path={path as string}
                      element={
                        <ErrorBoundary inline>
                          <Suspense fallback={<PageLoader />}>
                            <C />
                          </Suspense>
                        </ErrorBoundary>
                      }
                    />
                  );
                })}
              </Route>
            </Routes>
          </UIProvider>
          <ThemedToaster />
        </TooltipProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

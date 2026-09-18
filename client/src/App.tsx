import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Practice from "@/pages/practice";
import CBT from "@/pages/cbt";
import StudyTips from "@/pages/study-tips";
import History from "@/pages/history";
import Analytics from "@/pages/analytics";
import Admin from "@/pages/admin";
import Auth from "@/pages/auth";

/**
 * Guards a page behind authentication (and optionally the admin role).
 * While the current-user query is loading we render nothing to avoid a flash of
 * the login screen. Unauthenticated visitors are redirected to /auth; a
 * non-admin hitting an admin-only route is sent home.
 */
function ProtectedRoute({
  component: Component,
  requireAdmin = false,
}: {
  component: () => JSX.Element;
  requireAdmin?: boolean;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (requireAdmin && !user.isAdmin) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/practice" component={Practice} />
      <Route path="/cbt">
        <ProtectedRoute component={CBT} />
      </Route>
      <Route path="/study-tips" component={StudyTips} />
      <Route path="/auth" component={Auth} />
      <Route path="/history">
        <ProtectedRoute component={History} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={Analytics} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={Admin} requireAdmin />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

// routes/__root.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getShiftWorker, clearShiftWorker } from "@/lib/shift-worker";
import { Loader2 } from "lucide-react";
import { NotificationToastProvider } from "@/components/NotificationToast";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// Routes that never require auth
const PUBLIC_ROUTES = [
  "/auth",
  "/auth/merchant",
  "/auth/admin",
  "/auth/forgot-password",
  "/auth/shift",
  "/m/",
];

// ── Auth gate — rendered inside AuthProvider so useAuth() works ───────────────
function AuthGate() {
  const { user, merchantProfile, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const isPos = pathname.startsWith("/pos");
  const isMerchant = pathname.startsWith("/merchant");
  const isAdminRoute = pathname.startsWith("/admin");

  const merchantBlocked =
    merchantProfile === null || merchantProfile?.status === "rejected";

  useEffect(() => {
    if (loading) return;
    if (isPublic) return;

    if (!user) {
      // POS is merchant-operated now (no separate staff login), so it uses
      // the same merchant sign-in page as /merchant.
      const loginPage = isPos || isMerchant
        ? "/auth/merchant"
        : isAdminRoute
        ? "/auth/admin"
        : "/auth/";
      navigate({
        to: loginPage as any,
        search: { redirect: pathname },
        replace: true,
      });
      return;
    }

    // POS routes: require merchant Supabase login + shift worker session
    if (isPos && !merchantProfile) {
      if (getShiftWorker()) {
        // Worker is logged in but merchant auth expired — need merchant to re-login
        clearShiftWorker();
      }
      navigate({ to: "/auth/merchant" as any, replace: true });
      return;
    }

    if ((isMerchant || isPos) && merchantBlocked) {
      navigate({
        to: "/auth/merchant" as any,
        search: {
          redirect: pathname,
          rejected: merchantProfile?.status === "rejected" ? "true" : undefined,
        },
        replace: true,
      });
    }
  }, [user, merchantProfile, merchantBlocked, loading, isPublic, isPos, isMerchant, isAdminRoute, pathname]);

  if (loading && !isPublic) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && !user && !isPublic) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && user && (isMerchant || isPos) && merchantBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Mounted once here (not per-page) so toast notifications keep
          working no matter which route — customer or merchant — is
          currently active. Only renders once `user` exists, since the
          provider subscribes using auth.uid(). */}
      {user && <NotificationToastProvider />}
      <Outlet />
    </>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────────
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="font-display mt-3 text-5xl text-ink">Lost in the steam</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page wandered off. Let's head back to the counter.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <h1 className="font-display text-3xl text-ink">Something spilled</h1>
        <p className="mt-2 text-sm text-muted-foreground">Give it another try.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ── Route definition ──────────────────────────────────────────────────────────
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zentro — Order & Loyalty" },
      { name: "description", content: "Premium coffee ordering with a loyalty card that feels like a keepsake." },
      { property: "og:title", content: "Zentro — Order & Loyalty" },
      { property: "og:description", content: "Order, earn, redeem. A modern loyalty experience for your favorite cafés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* AuthGate sits inside AuthProvider so useAuth() is available */}
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
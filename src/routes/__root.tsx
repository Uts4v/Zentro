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
import { Loader2 } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// Routes that never require auth
const PUBLIC_ROUTES = [
  "/auth",
  "/auth/merchant",
  "/auth/admin",
  "/auth/forgot-password",
];
// ── Auth gate — rendered inside AuthProvider so useAuth() works ───────────────
function AuthGate() {
  const { user, merchantProfile, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPublic   = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const isMerchant = pathname.startsWith("/merchant");
  // /admin has its own dedicated guard in admin.tsx (checks isAdmin, redirects
  // non-admins to "/" without revealing the route exists). The root gate
  // only needs to handle the "not logged in at all" case for it, same as
  // any other protected route — role-specific logic for admin lives in
  // admin.tsx itself, not here, to avoid duplicating that check in two places.
  const isAdminRoute = pathname.startsWith("/admin");

  // A rejected merchant should be treated the same as "no merchant profile"
  // for routing purposes — both get bounced out of /merchant/*.
  const merchantBlocked =
    merchantProfile === null || merchantProfile?.status === "rejected";

  useEffect(() => {
    if (loading) return;
    if (isPublic) return;

    // Not logged in and on a protected route → send to the right login page
// Change this:
if (!user) {
  navigate({
    to: (isMerchant ? "/auth/merchant" : "/auth") as any,
    search: { redirect: pathname },
    replace: true,
  });
  return;
}

// To this:
if (!user) {
  const loginPage = isMerchant
    ? "/auth/merchant"
    : isAdminRoute
    ? "/auth/admin"
    : "/auth";

  navigate({
    to: loginPage as any,
    search: { redirect: pathname },
    replace: true,
  });
  return;
}

    // FIX: previously this gate only checked `if (user) return;` — any
    // logged-in session, regardless of role, was let straight through to
    // /merchant/* before merchant.tsx's own (correct) guard effect had a
    // chance to run. That gap was part of the race that let freshly
    // OAuth-signed-up customer accounts briefly render merchant pages.
    // Now the root gate itself checks role for merchant routes too, so
    // there's no window where a non-merchant session is considered "fine"
    // at this layer. Pending merchants are allowed through (merchant.tsx
    // shows its own banner); only a missing profile or "rejected" status
    // is blocked here.
    if (isMerchant && merchantBlocked) {
      navigate({
        to: "/auth/merchant" as any,
        search: {
          redirect: pathname,
          rejected: merchantProfile?.status === "rejected" ? "true" : undefined,
        },
        replace: true,
      });
    }
  }, [user, merchantProfile, merchantBlocked, loading, isPublic, isMerchant, pathname]);

  // While auth is initialising on a protected route, show a full-screen spinner
  // so the page never flashes protected content before the redirect fires
  if (loading && !isPublic) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auth done, not logged in, not a public route — spinner while redirect fires
  if (!loading && !user && !isPublic) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auth done, logged in, but on a merchant route with a blocked profile —
  // spinner while the redirect above fires, same reasoning as merchant.tsx.
  if (!loading && user && isMerchant && merchantBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Outlet />;
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
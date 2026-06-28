// routes/admin.tsx — Admin layout shell + auth guard
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, ShieldCheck, LogOut, Store } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Zentro" }] }),
  component: AdminLayout,
});

const navItems = [{ to: "/admin/", label: "Merchant approvals", icon: Store }];

function AdminLayout() {
  const { user, profile, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Single source of truth for "/admin/*" access. There is no separate
  // admin sign-in page — admins use the normal customer sign-in, and are
  // recognized purely by profiles.role === "admin". Promotion to admin
  // only happens via a direct database update (see admin_migration.sql);
  // there is no signup flow that can create one.
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({ to: "/auth" as any, search: { redirect: path }, replace: true });
      return;
    }

    if (!isAdmin) {
      // Not an admin — don't leak that /admin exists, just send them home.
      navigate({ to: "/" as any, replace: true });
    }
  }, [user, profile, loading, isAdmin]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" as any, replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/80 backdrop-blur-xl lg:flex">
        <div className="border-b border-border px-6 py-6">
          <Link to="/" className="font-display text-2xl text-ink">
            zentro<span className="text-ember">.</span>
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> admin
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = path === item.to || path === "/admin";
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-ink text-primary-foreground"
                    : "text-muted-foreground hover:bg-mist hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-4">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
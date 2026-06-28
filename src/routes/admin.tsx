import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Store,
  ShieldCheck,
  BarChart3,
  LogOut,
  Menu,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Zentro" }] }),
  component: AdminLayout,
  notFoundComponent: () => null, // suppress the warning while redirect fires
});

const navItems = [
  { to: "/admin/merchants", label: "Merchants", icon: Store },
  { to: "/admin/users",     label: "Users",     icon: Users },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

function AdminLayout() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate   = useNavigate();
  const path       = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({ to: "/auth/admin" as any, replace: true });
      return;
    }

    if (!profile) return;

    if (profile.role !== "admin") {
      supabase.auth.signOut().then(() => {
        navigate({
          to: "/auth/admin" as any,
          search: { unauthorized: "true" },
          replace: true,
        });
      });
    }
  }, [user, profile, loading]);

  // Redirect /admin and /admin/ to /admin/merchants
  useEffect(() => {
    if (path === "/admin" || path === "/admin/") {
      navigate({ to: "/admin/merchants" as any, replace: true });
    }
  }, [path]);

  if (loading || !user || !profile || profile.role !== "admin") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth/admin" as any, replace: true });
  }

  function SidebarContent() {
    return (
      <>
        {/* Logo */}
        <div className="border-b border-border px-6 py-6">
          <Link to="/" className="font-display text-2xl text-ink">
            zentro<span className="text-ember">.</span>
          </Link>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            admin
          </p>
        </div>

        {/* Admin badge */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-sm font-medium text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {profile.full_name ?? "Admin"}
              </p>
              <p className="text-[10px] text-muted-foreground">Administrator</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as any}
                onClick={() => setMobileOpen(false)}
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

        {/* Sign out */}
        <div className="border-t border-border px-3 py-4">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/80 backdrop-blur-xl lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <aside
            className="absolute bottom-0 left-0 top-0 flex w-64 flex-col bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      {/* Main area */}
<div className="flex min-w-0 flex-1 flex-col">
  {/* Mobile top bar */}
  <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
    <button
      onClick={() => setMobileOpen(true)}
      className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist"
    >
      <Menu className="h-4 w-4" />
    </button>
    <Link to="/" className="font-display text-xl text-ink">
      zentro<span className="text-ember">.</span>
    </Link>
    <div className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-ink">
      <ShieldCheck className="h-4 w-4 text-primary-foreground" />
    </div>
  </header>

  <main className="flex-1 overflow-y-auto p-6 lg:p-8">
    {path === "/admin" || path === "/admin/" ? null : <Outlet />}
  </main>
</div>
    </div>
  );
}
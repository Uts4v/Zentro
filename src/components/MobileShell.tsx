// components/MobileShell 
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { Home, ScanLine, Trophy, Gift, User, Package } from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof Home; center?: boolean };

// Renamed "/" to "Order" (not "Shop") to avoid the duplicate label that was
// making the nav bar look cluttered — "/retail" keeps "Shop" since that's
// the actual retail store section.
const nav: NavItem[] = [
  { to: "/",            label: "Order",    icon: Home },
  { to: "/missions",    label: "Missions", icon: ScanLine },
  { to: "/loyalty",     label: "Card",     icon: User, center: true },
  { to: "/retail",      label: "Shop",     icon: Package },
  { to: "/rewards",     label: "Rewards",  icon: Gift },
  { to: "/leaderboard", label: "Ranks",    icon: Trophy },
];

export function MobileShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col pb-28">
      {children}
      <nav className="fixed inset-x-0 bottom-3 z-50 mx-auto flex max-w-[440px] items-center justify-center px-4">
        <div className="glass-strong flex w-full items-center rounded-full px-1 py-2">
          {nav.map((n) => {
            const active = path === n.to;
            const Icon = n.icon;
            if (n.center) {
              return (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className="relative -mt-8 mx-0.5 grid h-14 w-14 shrink-0 place-items-center rounded-full gradient-ember text-white shadow-ember ring-4 ring-white/60"
                  aria-label={n.label}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </Link>
              );
            }
            return (
              <Link
                key={n.to}
                to={n.to as any}
                className={`flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[9px] font-medium transition-all ${
                  active ? "bg-mist text-ink" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.6} />
                <span className="whitespace-nowrap tracking-wide">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getInitial(name: string | null | undefined): string {
  if (!name) return "✦";
  return name.trim().charAt(0).toUpperCase();
}

export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const { profile, loading } = useAuth();

  const firstName = profile?.full_name?.split(" ")[0] ?? null;
  const initial   = getInitial(profile?.full_name);
  const greeting  = getGreeting();

  return (
    <header className="sticky top-0 z-40 px-5 pb-3 pt-5">
      <div className="flex items-center justify-between">
        {/* Left: logo */}
        <Link to="/" className="font-display text-2xl tracking-tight text-ink">
          zentro<span className="text-ember">.</span>
        </Link>

        {title && (
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
        )}

        {/* Right: avatar */}
        <div className="flex items-center gap-2">
          {right}
          <NotificationBell />
          <Link
            to={"/profile" as any}
            aria-label="Profile"
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-medium text-primary-foreground overflow-hidden"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initial}</span>
            )}
          </Link>
        </div>
      </div>

      {/* Welcome row — only shown on home page (no title passed) */}
      {!title && (
        <div className="mt-3">
          {loading ? (
            <div className="h-4 w-32 animate-pulse rounded-full bg-mist" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {greeting}
              {firstName ? (
                <>
                  ,{" "}
                  <span className="font-medium text-ink">{firstName}</span>
                </>
              ) : null}{" "}
              👋
            </p>
          )}
        </div>
      )}
    </header>
  );
}
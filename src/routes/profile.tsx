import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { useAuth } from "@/lib/auth";
import { Settings, Bell, CreditCard, ChevronRight, LogOut, Loader2 } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { customerApi, orderApi, type Order } from "@/lib/api";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Profile · Zentro" }] }),
  component: Profile,
});

function Profile() {
  const { profile: authProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [customerProfile, setCustomerProfile] = useState<{
    loyalty_points: number;
    streak_days: number;
    total_orders: number;
    tier: string;
    full_name: string;
  } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      customerApi.profile().then(setCustomerProfile).catch(() => {}),
      orderApi.myOrders().then(setOrders).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const displayName = customerProfile?.full_name || authProfile?.full_name || "Guest";
  const displayTier = customerProfile?.tier || authProfile?.tier || "Bronze";
  const displayPoints = customerProfile?.loyalty_points ?? 0;
  const displayStreak = customerProfile?.streak_days ?? 0;
  const displayVisits = (customerProfile?.total_orders ?? 0) + 24;

  return (
    <MobileShell>
      <TopBar />
      <section className="px-5">
        <div className="glass-strong flex items-center gap-4 rounded-3xl p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl gradient-ember text-3xl text-white shadow-ember">
            {authProfile?.avatar_url ? (
              <img
                src={authProfile.avatar_url}
                alt=""
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : (
              "✨"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {displayTier} tier
            </p>
            <h1 className="font-display truncate text-3xl text-ink">
              {displayName}
            </h1>
            <p className="text-xs text-muted-foreground">Member</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2 px-5">
        <Stat label="Points" value={displayPoints.toLocaleString()} />
        <Stat label="Streak" value={`${displayStreak}d`} />
        <Stat label="Visits" value={String(displayVisits)} />
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Recent orders
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="glass-strong rounded-3xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No orders yet. Start by visiting a store!</p>
          </div>
        ) : (
          <div className="glass-strong divide-y divide-border rounded-3xl">
            {orders.slice(0, 5).map((o) => (
              <Link
                key={o.id}
                to="/orders/$id"
                params={{ id: String(o.id) }}
                className="flex items-center gap-3 p-4"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist text-lg">
                  ☕
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">Order #{o.id}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.items?.length ?? 0} items · {o.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-base text-ink">NPR {parseFloat(o.total_amount).toLocaleString()}</p>
                  <p className="text-[10px] text-ember">+{o.points_earned} pts</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 px-5">
        <div className="glass-strong divide-y divide-border rounded-3xl">
          {/* <Row icon={Bell} label="Notifications" />
          <Row icon={CreditCard} label="Payment methods" />
          <Row icon={Settings} label="Account settings" /> */}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <LogOut className="h-4 w-4 text-destructive" />
            <span className="flex-1 text-sm text-destructive">Sign out</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </section>
    </MobileShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
}: {
  icon: typeof Bell;
  label: string;
}) {
  return (
    <button className="flex w-full items-center gap-3 p-4 text-left">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm text-ink">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

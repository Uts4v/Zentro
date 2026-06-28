import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Store, TrendingUp, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
});

type Stats = {
  totalUsers: number;
  totalMerchants: number;
  pendingMerchants: number;
  approvedMerchants: number;
  totalPoints: number;
};

function AdminAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setLoading(true);

    const [usersRes, merchantsRes, pointsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact" }).eq("role", "customer"),
      supabase.from("merchant_profiles").select("id, status"),
      supabase.from("profiles").select("points").eq("role", "customer"),
    ]);

    const merchants = merchantsRes.data ?? [];
    const totalPoints = (pointsRes.data ?? []).reduce((sum, u) => sum + (u.points ?? 0), 0);

    setStats({
      totalUsers: usersRes.count ?? 0,
      totalMerchants: merchants.length,
      pendingMerchants: merchants.filter((m) => m.status === "pending").length,
      approvedMerchants: merchants.filter((m) => m.status === "approved").length,
      totalPoints,
    });

    setLoading(false);
  }

  const cards = stats ? [
    { label: "Total customers",   value: stats.totalUsers,          icon: Users,        color: "bg-blue-50 text-blue-600" },
    { label: "Active merchants",  value: stats.approvedMerchants,   icon: Store,        color: "bg-emerald-50 text-emerald-600" },
    { label: "Pending approval",  value: stats.pendingMerchants,    icon: Clock,        color: "bg-amber-50 text-amber-600" },
    { label: "Total points issued", value: stats.totalPoints.toLocaleString(), icon: TrendingUp, color: "bg-purple-50 text-purple-600" },
  ] : [];

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
      <h1 className="font-display mt-2 text-4xl text-ink">Analytics</h1>
      <p className="mt-2 text-sm text-muted-foreground">Platform-wide overview.</p>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-2xl border border-border bg-background p-5">
                <div className={`inline-grid h-10 w-10 place-items-center rounded-xl ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-2xl font-medium text-ink">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
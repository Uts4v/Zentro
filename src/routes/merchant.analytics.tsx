// #merchant.analytics.tsx
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, Users, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/merchant/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Merchant" }] }),
  component: Analytics,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyRevenuePoint {
  date: string;
  revenue: number;
}

interface HeatmapPoint {
  dow: number; // 0 = Sunday
  hour: number; // 0-23
  count: number;
}

interface Kpis {
  revenue: number;
  revenue_prior: number;
  order_count: number;
  avg_order: number;
  new_members: number;
  repeat_rate: number;
}

interface AnalyticsData {
  daily_revenue: DailyRevenuePoint[];
  hourly_heatmap: HeatmapPoint[];
  kpis: Kpis;
}

interface LeaderboardEntry {
  customer_id: string;
  full_name: string | null;
  total_points: number;
  order_count: number;
}

const RANGE_DAYS: Record<"14d" | "30d" | "90d", number> = {
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat to match Postgres EXTRACT(DOW)

// ── Component ─────────────────────────────────────────────────────────────────

function Analytics() {
  const [range, setRange] = useState<"14d" | "30d" | "90d">("14d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      supabase.rpc("get_merchant_analytics", { days_back: RANGE_DAYS[range] }),
      supabase.rpc("get_merchant_leaderboard", { limit_count: 5 }),
    ])
      .then(([analyticsRes, leaderboardRes]) => {
        if (cancelled) return;
        if (analyticsRes.error) throw new Error(analyticsRes.error.message);
        if (leaderboardRes.error) throw new Error(leaderboardRes.error.message);
        setData(analyticsRes.data as AnalyticsData);
        setLeaderboard((leaderboardRes.data ?? []) as LeaderboardEntry[]);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Failed to load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const kpis = data?.kpis ?? {
    revenue: 0,
    revenue_prior: 0,
    order_count: 0,
    avg_order: 0,
    new_members: 0,
    repeat_rate: 0,
  };

  const revenueDelta = kpis.revenue_prior > 0
    ? ((kpis.revenue - kpis.revenue_prior) / kpis.revenue_prior) * 100
    : kpis.revenue > 0 ? 100 : 0;

  const dailyRevenue = data?.daily_revenue ?? [];
  const heatmap = data?.hourly_heatmap ?? [];

  // Build a dow x hour lookup for the heatmap grid
  const heatmapMap = new Map<string, number>();
  let maxCount = 1;
  for (const h of heatmap) {
    heatmapMap.set(`${h.dow}-${h.hour}`, h.count);
    if (h.count > maxCount) maxCount = h.count;
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Last {RANGE_DAYS[range]} days
        </p>
        <h1 className="font-display mt-1 text-5xl text-ink">Analytics</h1>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Revenue"
          value={`NPR ${kpis.revenue.toLocaleString()}`}
          delta={`${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(0)}%`}
          up={revenueDelta >= 0}
        />
        <Kpi label="New members" value={String(kpis.new_members)} delta="" up />
        <Kpi label="Repeat rate" value={`${kpis.repeat_rate}%`} delta="" up={kpis.repeat_rate >= 50} />
        <Kpi
          label="Avg order"
          value={`NPR ${kpis.avg_order.toLocaleString()}`}
          delta=""
          up
        />
      </div>

      {/* Revenue chart */}
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Revenue trend
            </p>
            <h2 className="font-display mt-1 text-3xl text-ink">
              NPR {kpis.revenue.toLocaleString()}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              vs. NPR {kpis.revenue_prior.toLocaleString()} prior period
            </p>
          </div>
          <div className="flex gap-1">
            {(["14d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRange(p)}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  range === p ? "bg-ink text-primary-foreground" : "glass text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 relative h-48">
          {dailyRevenue.every((d) => d.revenue === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No completed orders in this period yet
            </div>
          ) : (
            <RevenueChart points={dailyRevenue} />
          )}
        </div>
      </section>

      {/* Two col */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Heatmap */}
        <section className="glass-strong rounded-3xl p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Busy hours</p>
          <h3 className="font-display mt-1 text-2xl text-ink">When they come in</h3>
          {heatmap.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Not enough order history yet to show a pattern.
            </p>
          ) : (
            <>
              <div className="mt-5 space-y-2">
                {DOW_LABELS.map((d, dowIdx) => (
                  <div key={dowIdx} className="flex items-center gap-2">
                    <span className="w-3 text-[10px] text-muted-foreground">{d}</span>
                    <div className="flex flex-1 gap-1">
                      {Array.from({ length: 24 }).map((_, hour) => {
                        const count = heatmapMap.get(`${dowIdx}-${hour}`) ?? 0;
                        const intensity = count / maxCount;
                        return (
                          <div
                            key={hour}
                            className="h-5 flex-1 rounded-sm"
                            style={{
                              background: count === 0
                                ? "var(--mist, #eee)"
                                : `oklch(0.68 0.16 45 / ${Math.max(intensity, 0.1).toFixed(2)})`,
                            }}
                            title={`${count} order${count !== 1 ? "s" : ""}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>12am</span>
                <span>12pm</span>
                <span>11pm</span>
              </div>
            </>
          )}
        </section>

        {/* Leaderboard */}
        <section className="glass-strong rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Leaderboard
              </p>
              <h3 className="font-display mt-1 text-2xl text-ink">Top customers</h3>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          {leaderboard.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No completed orders yet — your top customers will show up here.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {leaderboard.map((entry, i) => (
                <li key={entry.customer_id} className="flex items-center gap-3">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${
                      i === 0
                        ? "bg-amber-100 text-amber-700"
                        : i === 1
                        ? "bg-slate-100 text-slate-600"
                        : i === 2
                        ? "bg-orange-100 text-orange-700"
                        : "bg-mist text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm text-ink">
                    {entry.full_name ?? "Customer"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.order_count} order{entry.order_count !== 1 ? "s" : ""}
                  </span>
                  <span className="font-display text-sm text-ember">
                    {entry.total_points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Revenue chart (real SVG line, driven by actual data) ──────────────────────

function RevenueChart({ points }: { points: DailyRevenuePoint[] }) {
  const values = points.map((p) => p.revenue);
  const max = Math.max(...values, 1);
  const coords = values.map(
    (v, i) => `${(i / Math.max(values.length - 1, 1)) * 280},${100 - (v / max) * 90}`
  );
  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L 280,100 L 0,100 Z`;

  return (
    <svg viewBox="0 0 280 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.68 0.16 45)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.68 0.16 45)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#revenueGradient)" />
      <path d={line} fill="none" stroke="oklch(0.68 0.16 45)" strokeWidth="1.5" />
    </svg>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function Kpi({ label, value, delta, up }: { label: string; value: string; delta: string; up?: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="glass-strong rounded-3xl p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="font-display mt-2 text-3xl text-ink">{value}</p>
      {delta && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[11px] ${up ? "text-emerald-600" : "text-destructive"}`}>
          <Icon className="h-3 w-3" /> {delta}
        </div>
      )}
    </div>
  );
}
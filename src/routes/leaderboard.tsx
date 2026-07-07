import { createFileRoute } from "@tanstack/react-router";
import { customerApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { requireAuth } from "@/lib/auth-guard";
import { useEffect, useState } from "react";
import { Flame, Trophy, Medal, Star } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: Leaders,
});

type LeaderEntry = {
  id: string;
  full_name: string | null;
  points: number;
  streak: number;
  tier: string;
  rank: number;
};

const TIER_CONFIG = [
  { name: "Bronze",   min: 0,    color: "bg-amber-700",  text: "text-amber-700" },
  { name: "Silver",   min: 200,  color: "bg-gray-400",   text: "text-gray-500"  },
  { name: "Gold",     min: 500,  color: "bg-yellow-500", text: "text-yellow-600"},
  { name: "Platinum", min: 1000, color: "bg-purple-500", text: "text-purple-600"},
];

function getTier(points: number) {
  return [...TIER_CONFIG].reverse().find((t) => points >= t.min) ?? TIER_CONFIG[0];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-sm font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function Leaders() {
  const [profile, setProfile] = useState<{
    id: string;
    loyalty_points: number;
    streak_days: number;
    total_orders: number;
    tier: string;
    full_name: string | null;
  } | null>(null);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Load current user profile
        const p = await customerApi.profile();
        setProfile(p);

        // Load top 50 by points from Supabase
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, points, streak, tier")
          .order("points", { ascending: false })
          .limit(50);

        if (error) throw error;

        const ranked: LeaderEntry[] = (data ?? []).map((row, i) => ({
          id: row.id,
          full_name: row.full_name,
          points: row.points ?? 0,
          streak: row.streak ?? 0,
          tier: row.tier ?? "Bronze",
          rank: i + 1,
        }));

        setLeaders(ranked);

        // Find current user's rank
        const myEntry = ranked.find((e) => e.id === p.id);
        if (myEntry) {
          setMyRank(myEntry.rank);
        } else {
          // User not in top 50 — count how many are above them
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("points", p.loyalty_points);
          setMyRank((count ?? 0) + 1);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const tier = profile ? getTier(profile.loyalty_points) : TIER_CONFIG[0];

  return (
    <MobileShell>
      <TopBar />
      <div className="px-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Rankings</p>
        <h1 className="font-display mt-1 text-4xl text-ink">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top customers ranked by loyalty points.
        </p>
      </div>

      {loading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {!loading && profile && (
        <>
          {/* Your rank card */}
          <section className="mt-6 px-5">
            <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-primary-foreground shadow-ember">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full gradient-ember opacity-30 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-ember" />
                      <p className="text-[11px] uppercase tracking-widest text-white/60">Your Rank</p>
                    </div>
                    <p className="font-display mt-1 text-6xl leading-none">
                      #{myRank ?? "—"}
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      {profile.full_name ?? "You"} · {tier.name}
                    </p>
                  </div>
                  <div className="glass-strong rounded-2xl px-4 py-3 text-center">
                    <p className="font-display text-3xl text-ink">
                      {profile.loyalty_points.toLocaleString()}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">pts</p>
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/10 p-3 text-center">
                  <p className="font-display text-2xl">{profile.loyalty_points.toLocaleString()}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/60">Points</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-center">
                  <p className="font-display text-2xl">{profile.total_orders}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/60">Orders</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="h-4 w-4 text-ember" />
                    <p className="font-display text-2xl">{profile.streak_days}</p>
                  </div>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/60">Streak</p>
                </div>
              </div>
            </div>
          </section>

          {/* Top 3 podium */}
          {leaders.length >= 3 && (
            <section className="mt-6 px-5">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Top 3</p>
              <div className="flex items-end gap-2">
                {/* 2nd place */}
                <div className="flex flex-1 flex-col items-center gap-2">
                  <p className="text-xs font-medium text-ink truncate max-w-full text-center">
                    {leaders[1].full_name ?? "Customer"}
                  </p>
                  <p className="text-xs text-muted-foreground">{leaders[1].points.toLocaleString()} pts</p>
                  <div className="flex h-16 w-full items-center justify-center rounded-t-2xl bg-gray-200 text-2xl">
                    🥈
                  </div>
                </div>
                {/* 1st place */}
                <div className="flex flex-1 flex-col items-center gap-2">
                  <p className="text-xs font-medium text-ink truncate max-w-full text-center">
                    {leaders[0].full_name ?? "Customer"}
                  </p>
                  <p className="text-xs text-muted-foreground">{leaders[0].points.toLocaleString()} pts</p>
                  <div className="flex h-24 w-full items-center justify-center rounded-t-2xl bg-amber-100 text-2xl">
                    🥇
                  </div>
                </div>
                {/* 3rd place */}
                <div className="flex flex-1 flex-col items-center gap-2">
                  <p className="text-xs font-medium text-ink truncate max-w-full text-center">
                    {leaders[2].full_name ?? "Customer"}
                  </p>
                  <p className="text-xs text-muted-foreground">{leaders[2].points.toLocaleString()} pts</p>
                  <div className="flex h-12 w-full items-center justify-center rounded-t-2xl bg-orange-100 text-2xl">
                    🥉
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Full leaderboard list */}
          <section className="mt-4 px-5 pb-8">
            <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Top {leaders.length}
            </p>
            <div className="space-y-2">
              {leaders.map((entry) => {
                const isMe = entry.id === profile.id;
                const entryTier = getTier(entry.points);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                      isMe
                        ? "bg-ink text-primary-foreground shadow-ember"
                        : "glass"
                    }`}
                  >
                    <RankBadge rank={entry.rank} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${isMe ? "text-white" : "text-ink"}`}>
                        {entry.full_name ?? "Customer"}
                        {isMe && <span className="ml-2 text-[10px] text-white/60">· You</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
                          {entryTier.name}
                        </span>
                        {entry.streak > 0 && (
                          <span className={`flex items-center gap-0.5 text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
                            <Flame className="h-2.5 w-2.5 text-ember" />
                            {entry.streak}d
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-display text-lg ${isMe ? "text-white" : "text-ink"}`}>
                        {entry.points.toLocaleString()}
                      </p>
                      <p className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>pts</p>
                    </div>
                  </div>
                );
              })}

              {/* Show current user's rank if not in top 50 */}
              {myRank && myRank > 50 && (
                <>
                  <div className="py-2 text-center text-xs text-muted-foreground">· · ·</div>
                  <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 shadow-ember">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                      {myRank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {profile.full_name ?? "You"}
                        <span className="ml-2 text-[10px] text-white/60">· You</span>
                      </p>
                      <p className="text-[10px] text-white/60">{tier.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg text-white">
                        {profile.loyalty_points.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-white/60">pts</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Tier milestones */}
          <section className="px-5 pb-8">
            <div className="glass rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-ember" />
                <p className="text-sm font-medium text-ink">Tier milestones</p>
              </div>
              <div className="space-y-3">
                {TIER_CONFIG.map((t) => {
                  const reached = profile.loyalty_points >= t.min;
                  const next = TIER_CONFIG.find((x) => x.min > profile.loyalty_points);
                  const isCurrent = getTier(profile.loyalty_points).name === t.name;
                  return (
                    <div key={t.name} className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${t.color} ${!reached ? "opacity-30" : ""}`} />
                      <span className={`text-sm ${reached ? "font-medium text-ink" : "text-muted-foreground"}`}>
                        {t.name}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-ember-soft px-2 py-0.5 text-[10px] text-ember">
                            Current
                          </span>
                        )}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{t.min.toLocaleString()}+ pts</span>
                      {reached && <span className="text-xs text-ember">✓</span>}
                    </div>
                  );
                })}
                {(() => {
                  const next = TIER_CONFIG.find((t) => t.min > profile.loyalty_points);
                  if (!next) return null;
                  const needed = next.min - profile.loyalty_points;
                  return (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {needed.toLocaleString()} more pts to reach {next.name}
                    </p>
                  );
                })()}
              </div>
            </div>
          </section>
        </>
      )}
    </MobileShell>
  );
}
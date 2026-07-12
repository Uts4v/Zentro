// routes/merchant.members.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Users, Search, X, Crown, ChevronDown, ChevronUp,
  ShoppingBag, Star, Zap, Calendar, CreditCard, TrendingUp,
} from "lucide-react";
import { merchantApi, type MerchantMember } from "@/lib/api";

export const Route = createFileRoute("/merchant/members")({
  head: () => ({ meta: [{ title: "Members · Merchant · Zentro" }] }),
  component: MerchantMembers,
});

const TIER_COLOURS: Record<string, string> = {
  Bronze: "bg-amber-100 text-amber-700",
  Silver: "bg-slate-100 text-slate-600",
  Gold: "bg-yellow-100 text-yellow-700",
  Platinum: "bg-sky-100 text-sky-700",
};

function tierClass(tier: string) {
  return TIER_COLOURS[tier] ?? "bg-mist text-muted-foreground";
}

function MerchantMembers() {
  const [members, setMembers] = useState<MerchantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const data = await merchantApi.members();
      setMembers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    );
  }, [members, search]);

  const totalSpent = useMemo(
    () => members.reduce((s, m) => s + m.total_spent, 0),
    [members]
  );

  const totalPointsDistributed = useMemo(
    () => members.reduce((s, m) => s + m.points_earned, 0),
    [members]
  );

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function timeAgo(iso: string | null) {
    if (!iso) return "Never";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Manage</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage your loyalty members.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button onClick={() => setError("")} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total members", value: members.length },
          { label: "Revenue", value: `NPR ${totalSpent.toLocaleString()}` },
          { label: "Points earned", value: totalPointsDistributed.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="glass rounded-2xl p-4 text-center">
            <p className="font-display text-2xl text-ink">{value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass-strong flex items-center gap-2 rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground/70"
        />
        {search && (
          <button onClick={() => setSearch("")} className="shrink-0 text-muted-foreground hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Member list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-3xl py-16 text-center">
          <p className="text-4xl">👥</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {search.trim() ? "No members match your search." : "No members yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((member) => {
            const isOpen = expanded === member.id;
            return (
              <article key={member.id} className="glass-strong overflow-hidden rounded-3xl">
                {/* Card header — always visible */}
                <button
                  onClick={() => setExpanded(isOpen ? null : member.id)}
                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-mist/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-primary-foreground">
                    {member.full_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">
                        {member.full_name ?? "Anonymous"}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tierClass(member.tier)}`}>
                        <Crown className="mr-0.5 inline h-2.5 w-2.5" />
                        {member.tier}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" />
                        {member.total_orders} orders
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {member.points} pts
                      </span>
                      <span>🔥 {member.streak}</span>
                    </div>
                  </div>

                  {/* Revenue + expand */}
                  <div className="shrink-0 text-right">
                    <p className="font-display text-base text-ink">
                      NPR {member.total_spent.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Last {timeAgo(member.last_order_at)}
                    </p>
                  </div>

                  {isOpen
                    ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                    {/* Membership ID */}
                    <div className="rounded-xl bg-mist p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5" />
                        Membership ID
                      </div>
                      <p className="mt-1 font-mono text-sm font-medium text-ink break-all">
                        {member.id}
                      </p>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <DetailStat
                        icon={<ShoppingBag className="h-3.5 w-3.5" />}
                        label="Total orders"
                        value={String(member.total_orders)}
                      />
                      <DetailStat
                        icon={<TrendingUp className="h-3.5 w-3.5" />}
                        label="Total spent"
                        value={`NPR ${member.total_spent.toLocaleString()}`}
                      />
                      <DetailStat
                        icon={<Star className="h-3.5 w-3.5" />}
                        label="Loyalty points"
                        value={String(member.points)}
                      />
                      <DetailStat
                        icon={<Zap className="h-3.5 w-3.5" />}
                        label="Points earned"
                        value={String(member.points_earned)}
                      />
                      <DetailStat
                        icon={<Zap className="h-3.5 w-3.5" />}
                        label="Streak"
                        value={`${member.streak} days`}
                      />
                      <DetailStat
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        label="Joined"
                        value={formatDate(member.created_at)}
                      />
                    </div>

                    {/* Punch card */}
                    <div className="rounded-xl bg-mist p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Punch card</span>
                        <span className="font-medium text-ink">
                          {member.punch_count} / {member.punches_to_free}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {Array.from({ length: member.punches_to_free }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-3 flex-1 rounded-full transition-colors ${
                              i < member.punch_count
                                ? "bg-ink"
                                : "bg-border"
                            }`}
                          />
                        ))}
                      </div>
                      {member.free_reward_available && (
                        <p className="mt-2 text-[11px] font-medium text-emerald-600">
                          🎁 Free reward available!
                        </p>
                      )}
                    </div>

                    {/* Last order */}
                    <div className="flex items-center justify-between rounded-xl bg-mist px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Last order</span>
                      <span className="font-medium text-ink">
                        {member.last_order_at ? formatDate(member.last_order_at) : "No orders yet"}
                      </span>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-mist p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-display text-lg text-ink">{value}</p>
    </div>
  );
}

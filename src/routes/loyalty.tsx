import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { customerApi, missionApi, merchantApi, type PunchCard, type MissionView } from "@/lib/api";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { Flame, Sparkles, Gift, Loader2, Copy, Check, X } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { useEffect, useState, useCallback } from "react";

export const Route = createFileRoute("/loyalty")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Your loyalty card · Zentro" },
      { name: "description", content: "Track your streak, points, and punch card." },
    ],
  }),
  component: Loyalty,
});

interface CustomerProfile {
  loyalty_points: number;
  streak_days: number;
  total_orders: number;
  tier: string;
  full_name: string;
  last_streak_at: string | null;
  streak_free_earned: boolean;
}

// Default punch card shape when no row exists yet for this merchant
const DEFAULT_PUNCH_CARD: PunchCard = {
  id: "",
  customer_id: "",
  merchant_id: "",
  punch_count: 0,
  lifetime_punches: 0,
  punches_to_free: 5,
  free_reward_available: false,
  created_at: "",
  updated_at: "",
  punch_card_bg_color: "#ffffff",
  punch_card_bg_image: null,
  punch_card_stamp_emoji: "✓",
  punch_card_stamp_mode: "orders",
};

function Loyalty() {
  const { selectedMerchantId, setSelectedMerchant } = useStore();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [missions, setMissions] = useState<MissionView[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [punchCard, setPunchCard] = useState<PunchCard>(DEFAULT_PUNCH_CARD);
  const [punchLoading, setPunchLoading] = useState(false);
  const [usingFreeReward, setUsingFreeReward] = useState(false);
  const [punchError, setPunchError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // FIX: Auto-select first merchant if none is selected
  useEffect(() => {
    if (selectedMerchantId) return;
    merchantApi
      .list()
      .then((list) => {
        if (list[0]) setSelectedMerchant(list[0].id);
      })
      .catch(console.error);
  }, [selectedMerchantId, setSelectedMerchant]);

  // Load profile on mount — this is the source of truth for points + streak
  useEffect(() => {
    setProfileLoading(true);
    customerApi
      .profile()
      .then(setProfile)
      .catch(console.error)
      .finally(() => setProfileLoading(false));

    missionApi
      .myMissions()
      .then(setMissions)
      .catch(() => setMissions([]))
      .finally(() => setMissionsLoading(false));
  }, []);

  // Load punch card whenever selected merchant changes
  const loadPunchCard = useCallback(async () => {
    if (!selectedMerchantId) {
      setPunchCard(DEFAULT_PUNCH_CARD);
      return;
    }
    setPunchLoading(true);
    setPunchError(null);
    try {
      const data = await customerApi.getPunchCard(selectedMerchantId);
      if (data) {
        setPunchCard(data);
      } else {
        setPunchCard({ ...DEFAULT_PUNCH_CARD, merchant_id: selectedMerchantId });
      }
    } catch (e: any) {
      setPunchError("Couldn't load punch card.");
      setPunchCard({ ...DEFAULT_PUNCH_CARD, merchant_id: selectedMerchantId ?? "" });
    } finally {
      setPunchLoading(false);
    }
  }, [selectedMerchantId]);

  useEffect(() => {
    loadPunchCard();
  }, [loadPunchCard]);

  async function handleUseFreeReward() {
    if (!selectedMerchantId || !punchCard.free_reward_available) return;
    setUsingFreeReward(true);
    setPunchError(null);
    try {
      const { code } = await customerApi.claimFreeReward(selectedMerchantId);
      setConfirmationCode(code);
      await loadPunchCard();
    } catch (e: any) {
      setPunchError(e.message || "Failed to claim reward. Try again.");
    } finally {
      setUsingFreeReward(false);
    }
  }

  // Derived display values
  const displayPoints = profile?.loyalty_points ?? 0;
  const displayStreak = profile?.streak_days ?? 0;
  const displayName = profile?.full_name ?? "Customer";
  const displayTier = profile?.tier ?? "Bronze";

  const punchCount = punchCard.punch_count;
  const punchesNeeded = punchCard.punches_to_free;
  const freeRewardReady = punchCard.free_reward_available;

  return (
    <MobileShell>
      <TopBar />

      {/* Loyalty card */}
      <section className="px-5">
        <div className="relative overflow-hidden rounded-[32px] bg-ink p-7 text-primary-foreground shadow-ember">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-ember opacity-50 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">Loyalty Card</p>
              <p className="mt-1 font-display text-3xl">Zentro Rewards</p>
            </div>
            <div className="glass-strong rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-ink">
              {displayTier}
            </div>
          </div>

          <div className="relative mt-10">
            <p className="text-xs text-white/60">Points balance</p>
            {profileLoading ? (
              <div className="mt-1 h-16 w-32 animate-pulse rounded-2xl bg-white/10" />
            ) : (
              <p className="font-display mt-1 text-[72px] leading-none tracking-tight">
                {displayPoints.toLocaleString()}
              </p>
            )}
          </div>

          {/* FIX: grid now has both columns and is properly closed */}
          <div className="relative mt-8 grid grid-cols-2 gap-3">
            {/* Streak */}
            <div className="rounded-2xl bg-white/8 p-3 backdrop-blur-md">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/60">
                <Flame className="h-3 w-3 text-ember" /> Streak
              </div>
              {profileLoading ? (
                <div className="mt-1 h-8 w-20 animate-pulse rounded-xl bg-white/10" />
              ) : (
                <>
                  <p className="font-display mt-1 text-3xl">
                    {displayStreak} {displayStreak === 1 ? "day" : "days"}
                  </p>
                  {profile?.streak_free_earned ? (
                    <p className="mt-1 text-[10px] text-amber-400">🎁 Free item ready!</p>
                  ) : profile?.last_streak_at ? (
                    (() => {
                      const hoursLeft =
                        12 -
                        (Date.now() - new Date(profile.last_streak_at!).getTime()) / 3_600_000;
                      return hoursLeft > 0 ? (
                        <p className="mt-1 text-[10px] text-white/40">
                          Next in {Math.ceil(hoursLeft)}h
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-emerald-400">✓ Eligible now</p>
                      );
                    })()
                  ) : (
                    <p className="mt-1 text-[10px] text-white/40">Place an order to start</p>
                  )}
                </>
              )}
            </div>

            {/* Total orders */}
            <div className="rounded-2xl bg-white/8 p-3 backdrop-blur-md">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/60">
                <Sparkles className="h-3 w-3 text-white/60" /> Orders
              </div>
              {profileLoading ? (
                <div className="mt-1 h-8 w-20 animate-pulse rounded-xl bg-white/10" />
              ) : (
                <>
                  <p className="font-display mt-1 text-3xl">{profile?.total_orders ?? 0}</p>
                  <p className="mt-1 text-[10px] text-white/40">lifetime</p>
                </>
              )}
            </div>
          </div>{/* end grid */}

          <div className="relative mt-6 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/50">Member</p>
              <p className="mt-0.5 text-sm font-medium">{displayName}</p>
            </div>
            <p className="font-mono text-[10px] tracking-widest text-white/40">
              •••• {String(profile?.total_orders ?? 0).padStart(4, "0")}
            </p>
          </div>
        </div>
      </section>

      {/* Punch card */}
      <section className="mt-6 px-5">
        <div className="glass-strong rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Punch card</p>
              <h3 className="font-display mt-1 text-2xl text-ink">
                Buy {punchesNeeded}, get 1 free
              </h3>
              {!selectedMerchantId ? (
                <p className="text-xs text-muted-foreground">Select a merchant to start</p>
              ) : punchLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : freeRewardReady ? (
                <p className="text-xs font-medium text-emerald-600">Reward ready to claim</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {Math.max(punchesNeeded - punchCount, 0)} more{" "}
                  {punchCard.punch_card_stamp_mode === "streak" ? "visit" : "order"}
                  {punchesNeeded - punchCount !== 1 ? "s" : ""} to unlock
                </p>
              )}
            </div>
            <span className="font-display text-3xl text-ember">
              {punchLoading ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded-xl bg-mist" />
              ) : (
                `${punchCount}/${punchesNeeded}`
              )}
            </span>
          </div>

          {/* Punch dots */}
          <div
            className="mt-4 grid gap-1.5 rounded-2xl p-3 transition-colors"
            style={{
              backgroundColor: punchCard.punch_card_bg_color || "#ffffff",
              backgroundImage: punchCard.punch_card_bg_image
                ? `url(${punchCard.punch_card_bg_image})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              gridTemplateColumns: `repeat(${punchesNeeded}, 1fr)`,
            }}
          >
            {Array.from({ length: punchesNeeded }).map((_, i) => {
              const filled = i < punchCount;
              const isFreeSlot = i === punchesNeeded - 1;
              const stamp = punchCard.punch_card_stamp_emoji || "✓";
              return (
                <div
                  key={i}
                  className={`grid aspect-square place-items-center rounded-lg text-sm transition-all duration-300 overflow-hidden ${
                    filled
                      ? freeRewardReady && isFreeSlot
                        ? "gradient-ember shadow-ember animate-pulse-ember"
                        : stamp.startsWith("http")
                          ? "border-2 border-border/30 bg-white/90"
                          : "bg-ink"
                      : "border-2 border-dashed border-border bg-mist/80"
                  }`}
                >
                  {filled ? (
                    isFreeSlot && freeRewardReady ? (
                      <Gift className="h-3 w-3 text-white" />
                    ) : stamp.startsWith("http") ? (
                      <img src={stamp} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-white">{stamp}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground/40 text-[10px]">·</span>
                  )}
                </div>
              );
            })}
          </div>

          {punchError && (
            <p className="mt-3 text-center text-xs text-rose-500">{punchError}</p>
          )}

          {freeRewardReady && selectedMerchantId ? (
            <div className="mt-4 rounded-2xl p-[1px] bg-gradient-to-r from-emerald-400/60 via-emerald-500 to-emerald-400/60 animate-pulse-ember">
              <button
                onClick={handleUseFreeReward}
                disabled={usingFreeReward}
                className="w-full rounded-[15px] gradient-ember py-3 text-sm font-semibold text-white tracking-wide transition-all disabled:opacity-60 active:scale-[0.98] hover:brightness-110"
              >
                {usingFreeReward ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Claiming…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Gift className="h-4 w-4" /> Claim your reward
                  </span>
                )}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {selectedMerchantId
                ? `${punchCount} of ${punchesNeeded} ${punchCard.punch_card_stamp_mode === "streak" ? "visits" : "orders"} completed ✨`
                : "Select a store then place orders to earn punches ✨"}
            </p>
          )}
        </div>
      </section>

      {/* Missions */}
      <section className="mt-6 px-5">
        <h2 className="font-display mb-3 text-2xl text-ink">Missions</h2>
        {missionsLoading ? (
          <div className="glass rounded-3xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Loading missions…</p>
          </div>
        ) : missions.length > 0 ? (
          <div className="space-y-3">
            {missions.map((m) => {
              const pct = Math.min((m.current_count / m.target_count) * 100, 100);
              const done = m.is_completed || m.current_count >= m.target_count;
              return (
                <div key={m.id} className="glass-strong rounded-3xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ember-soft text-2xl">
                      {m.icon || "🎯"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-medium text-ink">{m.title}</p>
                        <span className="font-display shrink-0 text-sm text-ember">
                          {m.current_count}/{m.target_count}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
                        <div
                          className={`h-full rounded-full transition-all ${done ? "bg-ink" : "gradient-ember"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Reward · <span className="text-ink">+{m.reward_points} pts</span>
                        </p>
                        {done && (
                          <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary-foreground">
                            Completed ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass rounded-3xl p-6 text-center">
            <p className="text-4xl">🎯</p>
            <p className="mt-3 text-sm font-medium text-ink">No missions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your merchant hasn't created any missions yet.
            </p>
          </div>
        )}
      </section>

      {/* Tier progress */}
      <section className="mt-4 px-5 pb-8">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Progress to Platinum</p>
            <p className="text-xs text-muted-foreground">{displayPoints}/1000 pts</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full gradient-ember transition-all"
              style={{ width: `${Math.min((displayPoints / 1000) * 100, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {1000 - displayPoints > 0
              ? `${1000 - displayPoints} pts to unlock Platinum perks.`
              : "You reached Platinum! 🎉"}
          </p>
        </div>
      </section>
      {/* Confirmation code modal */}
      {confirmationCode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-8 text-center">
            <button
              onClick={() => { setConfirmationCode(null); setCodeCopied(false); }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full gradient-ember">
              <Gift className="h-8 w-8 text-white" />
            </div>
            <h2 className="font-display mt-4 text-2xl text-ink">Reward Claimed!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Show this code to the merchant to confirm your reward.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-ink px-5 py-4">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-primary-foreground">
                {confirmationCode}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(confirmationCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 1500);
                }}
                className="ml-2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 transition-colors"
              >
                {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => { setConfirmationCode(null); setCodeCopied(false); }}
              className="mt-5 w-full rounded-full bg-mist py-2.5 text-sm font-medium text-ink hover:bg-mist/80 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
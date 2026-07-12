import { createFileRoute } from "@tanstack/react-router";
import { rewardApi, customerApi, type Reward } from "@/lib/api";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { Lock, Copy, Check, X, Ticket } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/rewards")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Rewards" }] }),
  component: Rewards,
});

function Rewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [redeemedRewardName, setRedeemedRewardName] = useState<string>("");
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      rewardApi.list().then(setRewards).catch(() => setRewards([])),
      customerApi.profile().then((p) => setPoints(p.loyalty_points)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleRedeem = async (reward: Reward) => {
    setRedeeming(reward.id);
    try {
      const redemption = await rewardApi.redeem(reward.id);
      const profile = await customerApi.profile();
      setPoints(profile.loyalty_points);
      setRedeemedRewardName(reward.name);
      setConfirmationCode(redemption.code);
    } catch (e: any) {
      alert(e.message || "Failed to redeem. Do you have enough points?");
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <MobileShell>
      <TopBar />
      <div className="px-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Redeem</p>
        <h1 className="font-display mt-1 text-4xl text-ink">Rewards</h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-ember-soft px-4 py-2">
          <span className="text-xs text-ink">Balance</span>
          <span className="font-display text-lg text-ember">{points} pts</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 px-5 pb-8">
        {loading && (
          <p className="col-span-2 text-center text-sm text-muted-foreground">Loading rewards…</p>
        )}
        {!loading && rewards.length === 0 && (
          <div className="col-span-2 glass rounded-3xl py-16 text-center">
            <p className="text-4xl">🎁</p>
            <p className="mt-3 text-sm text-muted-foreground">No rewards available yet.</p>
          </div>
        )}
        {rewards.map((r) => {
          const affordable = points >= r.points_cost;
          const isRedeeming = redeeming === r.id;
          const justRedeemed = successId === r.id;
          return (
            <article
              key={r.id}
              className={`glass relative flex flex-col rounded-3xl p-4 ${!affordable ? "opacity-70" : ""}`}
            >
              {!affordable && (
                <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-ink/80 text-primary-foreground">
                  <Lock className="h-3 w-3" />
                </div>
              )}
              <div className="grid h-24 place-items-center rounded-2xl bg-mist text-5xl">
                {r.emoji || "🎁"}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">{r.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-display text-xl text-ink">{r.points_cost} pts</span>
                <button
                  disabled={!affordable || isRedeeming}
                  onClick={() => handleRedeem(r)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest transition-all ${
                    justRedeemed
                      ? "bg-emerald-500 text-white"
                      : affordable
                      ? "bg-ink text-primary-foreground hover:opacity-90"
                      : "bg-mist text-muted-foreground"
                  }`}
                >
                  {isRedeeming ? "…" : justRedeemed ? "✓" : affordable ? "Redeem" : "Locked"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
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
              <Ticket className="h-8 w-8 text-white" />
            </div>
            <h2 className="font-display mt-4 text-2xl text-ink">Reward Redeemed!</h2>
            <p className="mt-1 text-sm text-muted-foreground">{redeemedRewardName}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Show this code to the merchant to collect your reward.
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
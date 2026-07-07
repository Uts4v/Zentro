import { createFileRoute } from "@tanstack/react-router";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  Gift, Stamp, Trophy, QrCode,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { loyaltyApi } from "@/lib/api";

export const Route = createFileRoute("/merchant/loyalty")({
  head: () => ({ meta: [{ title: "Loyalty · Merchant · Zentro" }] }),
  component: MerchantLoyalty,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface PunchMission {
  id: string;
  title: string;
  description: string;
  punches_required: number;
  reward_label: string;
  is_active: boolean;
}

interface PunchClaim {
  id: string;
  claim_code: string;
  status: "pending" | "confirmed" | "expired";
  created_at: string;
  expires_at: string;
  customer_id: string;
  mission_id: string;
  profiles?: { full_name: string | null } | null;
  punch_missions?: { title: string; reward_label: string } | null;
}

interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
  active: boolean;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
}

interface RedeemResult {
  success: boolean;
  message: string;
  customer_name?: string;
  mission_title?: string;
  reward_label?: string;
  points_deducted?: number;
  new_balance?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMerchantId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) throw new Error("Merchant profile not found");
  return data.id;
}

async function getMerchantData(): Promise<{ id: string; punches_to_free: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("id, punches_to_free")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) throw new Error("Merchant profile not found");
  return { id: data.id, punches_to_free: data.punches_to_free ?? 5 };
}

// ── Component ─────────────────────────────────────────────────────────────────

function MerchantLoyalty() {
  const [tab, setTab] = useState<"punchcard" | "missions" | "rewards" | "redeem">("punchcard");

  // Punch card state
  const [punchesConfig, setPunchesConfig] = useState(5);
  const [punchConfigSaving, setPunchConfigSaving] = useState(false);
  const [punchMissions, setPunchMissions] = useState<PunchMission[]>([]);
  const [punchMissionsLoading, setPunchMissionsLoading] = useState(true);
  const [punchMissionModal, setPunchMissionModal] = useState<"new" | PunchMission | null>(null);
  const [punchMissionSaving, setPunchMissionSaving] = useState(false);
  const [pendingClaims, setPendingClaims] = useState<PunchClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [confirmingClaim, setConfirmingClaim] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<RedeemResult | null>(null);
  const [punchError, setPunchError] = useState("");

  // Existing missions/rewards/redeem state
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [missionsError, setMissionsError] = useState("");
  const [missionModal, setMissionModal] = useState<"new" | Mission | null>(null);
  const [missionSaving, setMissionSaving] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [rewardsError, setRewardsError] = useState("");
  const [rewardModal, setRewardModal] = useState<"new" | Reward | null>(null);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  // Load punch card config + missions + pending claims
  useEffect(() => {
    async function load() {
      try {
        const merchant = await getMerchantData();
        setPunchesConfig(merchant.punches_to_free);

        const [missionsRes, claimsRes] = await Promise.all([
          supabase
            .from("punch_missions")
            .select("*")
            .eq("merchant_id", merchant.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("punch_claims")
            .select("*, profiles(full_name), punch_missions(title, reward_label)")
            .eq("merchant_id", merchant.id)
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false }),
        ]);

        if (missionsRes.data) setPunchMissions(missionsRes.data as PunchMission[]);
        if (claimsRes.data) setPendingClaims(claimsRes.data as PunchClaim[]);
      } catch (e: any) {
        setPunchError(e.message);
      } finally {
        setPunchMissionsLoading(false);
        setClaimsLoading(false);
      }
    }
    load();
  }, []);

  // Load point-based missions
  useEffect(() => {
    getMerchantId()
      .then((merchantId) =>
        supabase.from("missions").select("*").eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
      )
      .then(({ data, error }: any) => {
        if (error) setMissionsError(error.message);
        else setMissions((data ?? []).map((m: any) => ({
          id: m.id, title: m.title, description: m.description ?? "",
          target: m.target_count ?? 1, reward: m.reward_points ?? 0,
          active: m.is_active ?? true,
        })));
      })
      .catch((e: any) => setMissionsError(e.message))
      .finally(() => setMissionsLoading(false));
  }, []);

  // Load rewards
  useEffect(() => {
    getMerchantId()
      .then((merchantId) =>
        supabase.from("rewards").select("*").eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
      )
      .then(({ data, error }: any) => {
        if (error) setRewardsError(error.message);
        else setRewards((data ?? []) as Reward[]);
      })
      .catch((e: any) => setRewardsError(e.message))
      .finally(() => setRewardsLoading(false));
  }, []);

  // ── Punch card config ───────────────────────────────────────────────────────

  async function savePunchConfig() {
  setPunchConfigSaving(true);
  setPunchError("");
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("merchant_profiles")
      .update({ punches_to_free: punchesConfig })
      .eq("user_id", user.id)  // use user_id directly — more reliable
      .select("id, punches_to_free")
      .single();

    if (error) throw new Error(error.message);

    // Update all existing punch cards for this merchant
    await supabase
      .from("punch_cards")
      .update({ punches_to_free: punchesConfig })
      .eq("merchant_id", data.id);

  } catch (e: any) {
    setPunchError(e.message);
  } finally {
    setPunchConfigSaving(false);
  }
}
  // ── Punch missions CRUD ─────────────────────────────────────────────────────

  async function savePunchMission(data: Omit<PunchMission, "id">) {
    setPunchMissionSaving(true);
    setPunchError("");
    try {
      const merchantId = await getMerchantId();
      const payload = {
        merchant_id: merchantId,
        title: data.title,
        description: data.description,
        punches_required: data.punches_required,
        reward_label: data.reward_label,
        is_active: data.is_active,
      };

      if (typeof punchMissionModal === "object" && punchMissionModal !== null) {
        const { error } = await supabase
          .from("punch_missions")
          .update(payload)
          .eq("id", punchMissionModal.id);
        if (error) throw new Error(error.message);
        setPunchMissions((ms) => ms.map((m) =>
          m.id === (punchMissionModal as PunchMission).id ? { ...m, ...data } : m
        ));
      } else {
        const { data: created, error } = await supabase
          .from("punch_missions")
          .insert(payload)
          .select()
          .single();
        if (error) throw new Error(error.message);
        setPunchMissions((ms) => [created as PunchMission, ...ms]);
      }
      setPunchMissionModal(null);
    } catch (e: any) {
      setPunchError(e.message);
    } finally {
      setPunchMissionSaving(false);
    }
  }

  async function deletePunchMission(id: string) {
    const { error } = await supabase.from("punch_missions").delete().eq("id", id);
    if (error) setPunchError(error.message);
    else setPunchMissions((ms) => ms.filter((m) => m.id !== id));
  }

  async function togglePunchMission(m: PunchMission) {
    const { error } = await supabase
      .from("punch_missions")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    if (error) setPunchError(error.message);
    else setPunchMissions((ms) => ms.map((x) =>
      x.id === m.id ? { ...x, is_active: !x.is_active } : x
    ));
  }

  // ── Confirm punch claim ─────────────────────────────────────────────────────

  async function confirmPunchClaim(claimId: string, code: string) {
    setConfirmingClaim(claimId);
    setClaimResult(null);
    try {
      const { data, error } = await supabase.rpc("confirm_punch_claim", {
        p_code: code,
      });
      if (error) throw new Error(error.message);
      const result = data as any;
      setClaimResult({
        success: true,
        message: "Reward claimed!",
        customer_name: result.customer_name,
        mission_title: result.mission_title,
        reward_label: result.reward_label,
      });
      setPendingClaims((prev) => prev.filter((c) => c.id !== claimId));
    } catch (e: any) {
      setClaimResult({ success: false, message: e.message });
    } finally {
      setConfirmingClaim(null);
    }
  }

  // ── Redeem code confirm ─────────────────────────────────────────────────────

  async function handleConfirmCode() {
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemResult(null);

    // Try punch claim first
    try {
      const { data, error } = await supabase.rpc("confirm_punch_claim", {
        p_code: redeemCode.trim().toUpperCase(),
      });
      if (!error && data) {
        const result = data as any;
        setRedeemResult({
          success: true,
          message: "Punch reward confirmed!",
          customer_name: result.customer_name,
          reward_label: result.reward_label,
        });
        setRedeemCode("");
        setRedeemLoading(false);
        return;
      }
    } catch { }

    // Fall back to points redemption
    try {
      const res = await loyaltyApi.confirmRedemption(redeemCode.trim());
      setRedeemResult({
        success: true,
        message: "Redeemed",
        customer_name: res.customer_name,
        points_deducted: res.points_deducted,
      });
      setRedeemCode("");
    } catch (e: any) {
      setRedeemResult({ success: false, message: e.message });
    } finally {
      setRedeemLoading(false);
    }
  }

  // ── Mission CRUD ────────────────────────────────────────────────────────────

  async function saveMission(data: Omit<Mission, "id">) {
    setMissionSaving(true);
    setMissionsError("");
    try {
      const merchantId = await getMerchantId();
      const payload = {
        merchant_id: merchantId,
        title: data.title,
        description: data.description,
        target_count: data.target,
        reward_points: data.reward,
        is_active: data.active,
      };
      if (typeof missionModal === "object" && missionModal !== null) {
        const { error } = await supabase.from("missions").update(payload)
          .eq("id", missionModal.id).select().single();
        if (error) throw new Error(error.message);
        setMissions((ms) => ms.map((m) =>
          m.id === missionModal.id ? { ...m, ...data, id: m.id } : m
        ));
      } else {
        const { data: created, error } = await supabase.from("missions")
          .insert(payload).select().single();
        if (error) throw new Error(error.message);
        setMissions((ms) => [{ id: created.id, ...data }, ...ms]);
      }
      setMissionModal(null);
    } catch (e: any) {
      setMissionsError(e.message);
    } finally {
      setMissionSaving(false);
    }
  }

  async function deleteMission(id: string) {
    const { error } = await supabase.from("missions").delete().eq("id", id);
    if (error) setMissionsError(error.message);
    else setMissions((ms) => ms.filter((m) => m.id !== id));
  }

  async function toggleMission(m: Mission) {
    const { error } = await supabase.from("missions")
      .update({ is_active: !m.active }).eq("id", m.id);
    if (error) setMissionsError(error.message);
    else setMissions((ms) => ms.map((x) =>
      x.id === m.id ? { ...x, active: !x.active } : x
    ));
  }

  // ── Reward CRUD ─────────────────────────────────────────────────────────────

  async function saveReward(data: Omit<Reward, "id">) {
    setRewardSaving(true);
    setRewardsError("");
    try {
      const merchantId = await getMerchantId();
      const payload = {
        merchant_id: merchantId,
        name: data.name,
        description: data.description,
        points_cost: data.points_cost,
        stock: data.stock,
        is_active: data.is_active,
      };
      if (typeof rewardModal === "object" && rewardModal !== null) {
        const { error } = await supabase.from("rewards").update(payload)
          .eq("id", rewardModal.id);
        if (error) throw new Error(error.message);
        setRewards((rs) => rs.map((r) => r.id === rewardModal.id ? { ...r, ...data } : r));
      } else {
        const { data: created, error } = await supabase.from("rewards")
          .insert(payload).select().single();
        if (error) throw new Error(error.message);
        setRewards((rs) => [{ id: created.id, ...data }, ...rs]);
      }
      setRewardModal(null);
    } catch (e: any) {
      setRewardsError(e.message);
    } finally {
      setRewardSaving(false);
    }
  }

  async function deleteReward(id: string) {
    const { error } = await supabase.from("rewards").delete().eq("id", id);
    if (error) setRewardsError(error.message);
    else setRewards((rs) => rs.filter((r) => r.id !== id));
  }

  async function toggleReward(r: Reward) {
    const { error } = await supabase.from("rewards")
      .update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) setRewardsError(error.message);
    else setRewards((rs) => rs.map((x) =>
      x.id === r.id ? { ...x, is_active: !x.is_active } : x
    ));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Engine</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Loyalty</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-mist p-1 overflow-x-auto">
        {(["punchcard", "missions", "rewards", "redeem"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 shrink-0 rounded-xl py-2 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t === "punchcard" ? "Punch Card" : t}
          </button>
        ))}
      </div>

      {/* ── PUNCH CARD TAB ── */}
      {tab === "punchcard" && (
        <div className="space-y-6">
          {punchError && <ErrorBanner message={punchError} />}

          {/* Config: punches to free */}
          <div className="glass-strong rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink">
                <Stamp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="font-display text-xl text-ink">Punch Card Setup</h2>
                <p className="text-xs text-muted-foreground">How many punches before a free reward?</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPunchesConfig((p) => Math.max(1, p - 1))}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-ink hover:bg-mist"
                >
                  −
                </button>
                <span className="font-display w-12 text-center text-4xl text-ink">
                  {punchesConfig}
                </span>
                <button
                  onClick={() => setPunchesConfig((p) => Math.min(20, p + 1))}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-ink hover:bg-mist"
                >
                  +
                </button>
              </div>
              <span className="text-sm text-muted-foreground">punches for a free reward</span>
              <button
                onClick={savePunchConfig}
                disabled={punchConfigSaving}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {punchConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </div>

            {/* Visual punch card preview */}
            <div className="mt-5 flex flex-wrap gap-2">
              {Array.from({ length: punchesConfig }).map((_, i) => (
                <div
                  key={i}
                  className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-border bg-mist text-xs text-muted-foreground"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Punch missions */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl text-ink">Punch Missions</h2>
                <p className="text-xs text-muted-foreground">
                  Milestone rewards — e.g. 3 punches = free drink
                </p>
              </div>
              <button
                onClick={() => setPunchMissionModal("new")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-white"
              >
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>

            {punchMissionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : punchMissions.length === 0 ? (
              <EmptyState
                icon="👊"
                title="No punch missions yet"
                sub="Add a mission like '3 punches = free drink'"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {punchMissions.map((m) => (
                  <div
                    key={m.id}
                    className={`glass rounded-3xl p-5 transition-opacity ${m.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                            {m.punches_required}
                          </span>
                          <p className="truncate font-medium text-ink">{m.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                          🎁 {m.reward_label}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconBtn onClick={() => setPunchMissionModal(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn onClick={() => deletePunchMission(m.id)} danger>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {m.punches_required} punches required
                      </p>
                      <Toggle active={m.is_active} onToggle={() => togglePunchMission(m)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending claims */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-display text-2xl text-ink">Pending Claims</h2>
              {pendingClaims.length > 0 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ember text-[10px] font-bold text-white">
                  {pendingClaims.length}
                </span>
              )}
            </div>

            {claimResult && (
              <div className={`mb-4 flex items-start gap-3 rounded-2xl p-4 ${
                claimResult.success ? "bg-emerald-50" : "bg-rose-50"
              }`}>
                {claimResult.success
                  ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                <div>
                  <p className={`text-sm font-medium ${
                    claimResult.success ? "text-emerald-700" : "text-rose-600"
                  }`}>
                    {claimResult.message}
                  </p>
                  {claimResult.success && (
                    <p className="mt-0.5 text-xs text-emerald-600">
                      {claimResult.customer_name} · {claimResult.reward_label}
                    </p>
                  )}
                </div>
              </div>
            )}

            {claimsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingClaims.length === 0 ? (
              <EmptyState icon="✅" title="No pending claims" sub="Customer claim cards will appear here." />
            ) : (
              <div className="space-y-3">
                {pendingClaims.map((claim) => {
                  const expiresIn = Math.max(
                    0,
                    Math.floor((new Date(claim.expires_at).getTime() - Date.now()) / 1000 / 60)
                  );
                  return (
                    <div key={claim.id} className="glass-strong rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-ink">
                            {claim.profiles?.full_name ?? "Customer"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {claim.punch_missions?.title} · 🎁 {claim.punch_missions?.reward_label}
                          </p>
                          <p className="mt-1 font-mono text-lg font-bold tracking-widest text-ink">
                            {claim.claim_code}
                          </p>
                          <p className="text-[11px] text-amber-600">
                            Expires in {expiresIn}m
                          </p>
                        </div>
                        <button
                          onClick={() => confirmPunchClaim(claim.id, claim.claim_code)}
                          disabled={confirmingClaim === claim.id}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {confirmingClaim === claim.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <><Check className="h-4 w-4" /> Confirm</>
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MISSIONS TAB ── */}
      {tab === "missions" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Missions</h2>
              <p className="text-xs text-muted-foreground">Challenges customers complete for points.</p>
            </div>
            <button
              onClick={() => setMissionModal("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {missionsError && <ErrorBanner message={missionsError} />}
          {missionsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : missions.length === 0 ? (
            <EmptyState icon="🎯" title="No missions yet" sub="Create your first mission." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {missions.map((m) => (
                <div key={m.id} className={`glass rounded-3xl p-5 ${m.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{m.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconBtn onClick={() => setMissionModal(m)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn onClick={() => deleteMission(m.id)} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-3">
                      <Chip label="Target" value={`${m.target} orders`} />
                      <Chip label="Reward" value={`${m.reward} pts`} />
                    </div>
                    <Toggle active={m.active} onToggle={() => toggleMission(m)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── REWARDS TAB ── */}
      {tab === "rewards" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Rewards</h2>
              <p className="text-xs text-muted-foreground">Items customers redeem with points.</p>
            </div>
            <button
              onClick={() => setRewardModal("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {rewardsError && <ErrorBanner message={rewardsError} />}
          {rewardsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rewards.length === 0 ? (
            <EmptyState icon="🎁" title="No rewards yet" sub="Add a reward for customers to redeem." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rewards.map((r) => (
                <div key={r.id} className={`glass rounded-3xl p-5 ${r.is_active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-mist text-2xl">
                        <Gift className="h-5 w-5 text-ember" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconBtn onClick={() => setRewardModal(r)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn onClick={() => deleteReward(r.id)} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-3">
                      <Chip label="Cost" value={`${r.points_cost} pts`} />
                      <Chip label="Stock" value={r.stock === -1 ? "Unlimited" : `${r.stock} left`} />
                    </div>
                    <Toggle active={r.is_active} onToggle={() => toggleReward(r)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── REDEEM TAB ── */}
      {tab === "redeem" && (
        <section>
          <div className="glass-strong rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <QrCode className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display text-2xl text-ink">Confirm code</h2>
                <p className="text-xs text-muted-foreground">
                  Enter a punch claim code or points redemption code.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
              <button
                onClick={handleConfirmCode}
                disabled={redeemLoading || redeemCode.length < 6}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {redeemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm
              </button>
            </div>
            {redeemResult && (
              <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${
                redeemResult.success ? "bg-emerald-50" : "bg-rose-50"
              }`}>
                {redeemResult.success
                  ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                <div>
                  <p className={`text-sm font-medium ${
                    redeemResult.success ? "text-emerald-700" : "text-rose-600"
                  }`}>
                    {redeemResult.message}
                  </p>
                  {redeemResult.success && redeemResult.customer_name && (
                    <p className="mt-0.5 text-xs text-emerald-600">
                      {redeemResult.customer_name}
                      {redeemResult.reward_label ? ` · ${redeemResult.reward_label}` : ""}
                      {redeemResult.points_deducted ? ` · −${redeemResult.points_deducted} pts` : ""}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Modals */}
      {punchMissionModal !== null && (
        <PunchMissionModal
          initial={punchMissionModal === "new" ? null : punchMissionModal}
          saving={punchMissionSaving}
          onSave={savePunchMission}
          onClose={() => setPunchMissionModal(null)}
        />
      )}
      {missionModal !== null && (
        <MissionModal
          initial={missionModal === "new" ? null : missionModal}
          saving={missionSaving}
          onSave={saveMission}
          onClose={() => setMissionModal(null)}
        />
      )}
      {rewardModal !== null && (
        <RewardModal
          initial={rewardModal === "new" ? null : rewardModal}
          saving={rewardSaving}
          onSave={saveReward}
          onClose={() => setRewardModal(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ink/20";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="glass rounded-3xl py-12 text-center">
      <p className="text-4xl">{icon}</p>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${active ? "bg-ink" : "bg-border"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}

function IconBtn({ onClick, danger, children }: {
  onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors ${
        danger ? "hover:bg-rose-50 hover:text-rose-500" : "hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-ink">{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-mist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PunchMissionModal({ initial, saving, onSave, onClose }: {
  initial: PunchMission | null; saving: boolean;
  onSave: (d: Omit<PunchMission, "id">) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [punches, setPunches] = useState(String(initial?.punches_required ?? 3));
  const [rewardLabel, setRewardLabel] = useState(initial?.reward_label ?? "");

  return (
    <Modal title={initial ? "Edit punch mission" : "New punch mission"} onClose={onClose}>
      <div className="space-y-3">
        <FieldLabel label="Mission title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Coffee streak" className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Get 3 punches and earn a free drink" className={inputCls} />
        </FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Punches required">
            <input type="number" min={1} max={20} value={punches}
              onChange={(e) => setPunches(e.target.value)} className={inputCls} />
          </FieldLabel>
          <FieldLabel label="Reward label">
            <input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)}
              placeholder="e.g. Free coffee" className={inputCls} />
          </FieldLabel>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="h-10 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">
            Cancel
          </button>
          <button
            onClick={() => onSave({
              title, description,
              punches_required: Number(punches),
              reward_label: rewardLabel,
              is_active: initial?.is_active ?? true,
            })}
            disabled={saving || !title.trim() || !rewardLabel.trim()}
            className="h-10 flex-1 rounded-2xl bg-ink text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MissionModal({ initial, saving, onSave, onClose }: {
  initial: Mission | null; saving: boolean;
  onSave: (d: Omit<Mission, "id">) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [target, setTarget] = useState(String(initial?.target ?? 5));
  const [reward, setReward] = useState(String(initial?.reward ?? 100));

  return (
    <Modal title={initial ? "Edit mission" : "New mission"} onClose={onClose}>
      <div className="space-y-3">
        <FieldLabel label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. First 5 orders" className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown to customers" className={inputCls} />
        </FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Target orders">
            <input type="number" min={1} value={target}
              onChange={(e) => setTarget(e.target.value)} className={inputCls} />
          </FieldLabel>
          <FieldLabel label="Points reward">
            <input type="number" min={1} value={reward}
              onChange={(e) => setReward(e.target.value)} className={inputCls} />
          </FieldLabel>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="h-10 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">
            Cancel
          </button>
          <button
            onClick={() => onSave({ title, description, target: Number(target), reward: Number(reward), active: initial?.active ?? true })}
            disabled={saving || !title.trim()}
            className="h-10 flex-1 rounded-2xl bg-ink text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RewardModal({ initial, saving, onSave, onClose }: {
  initial: Reward | null; saving: boolean;
  onSave: (d: Omit<Reward, "id">) => void; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pointsCost, setPointsCost] = useState(String(initial?.points_cost ?? 100));
  const [stock, setStock] = useState(String(initial?.stock ?? -1));

  return (
    <Modal title={initial ? "Edit reward" : "New reward"} onClose={onClose}>
      <div className="space-y-3">
        <FieldLabel label="Reward name">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Free flat white" className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What the customer gets" className={inputCls} />
        </FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Points cost">
            <input type="number" min={1} value={pointsCost}
              onChange={(e) => setPointsCost(e.target.value)} className={inputCls} />
          </FieldLabel>
          <FieldLabel label="Stock (-1 = unlimited)">
            <input type="number" min={-1} value={stock}
              onChange={(e) => setStock(e.target.value)} className={inputCls} />
          </FieldLabel>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="h-10 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, description, points_cost: Number(pointsCost), stock: Number(stock), is_active: initial?.is_active ?? true })}
            disabled={saving || !name.trim()}
            className="h-10 flex-1 rounded-2xl bg-ink text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2, Gift } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { loyaltyApi } from "@/lib/api";

export const Route = createFileRoute("/merchant/loyalty")({
  head: () => ({ meta: [{ title: "Loyalty · Merchant · Zentro" }] }),
  component: MerchantLoyalty,
});

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

function MerchantLoyalty() {
  const [tab, setTab] = useState<"missions" | "rewards" | "redeem">("missions");

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
  const [manualEmail, setManualEmail] = useState("");
  const [manualPoints, setManualPoints] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<RedeemResult | null>(null);

  // Load this merchant's own missions
  // (single source of truth — previously there were two competing effects here,
  // one loading ALL active missions globally and one loading the merchant's own,
  // which raced against each other. Removed the global one.)
  useEffect(() => {
    getMerchantId()
      .then((merchantId) =>
        supabase
          .from("missions")
          .select("*")
          .eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
      )
      .then(({ data, error }: any) => {
        if (error) setMissionsError(error.message);
        else setMissions((data ?? []).map((m: any) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? "",
          target: m.target_count ?? 1,
          reward: m.reward_points ?? 0,
          active: m.is_active ?? true,
        })));
      })
      .catch((e: any) => setMissionsError(e.message))
      .finally(() => setMissionsLoading(false));
  }, []);

  // Load this merchant's own rewards
  useEffect(() => {
    getMerchantId()
      .then((merchantId) =>
        supabase
          .from("rewards")
          .select("*")
          .eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
      )
      .then(({ data, error }: any) => {
        if (error) setRewardsError(error.message);
        else setRewards((data ?? []) as Reward[]);
      })
      .catch((e: any) => setRewardsError(e.message))
      .finally(() => setRewardsLoading(false));
  }, []);

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
        const { error } = await supabase
          .from("missions")
          .update(payload)
          .eq("id", missionModal.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        setMissions((ms) => ms.map((m) => m.id === missionModal.id ? {
          ...m, ...data, id: m.id,
        } : m));
      } else {
        const { data: created, error } = await supabase
          .from("missions")
          .insert(payload)
          .select()
          .single();
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
    const { error } = await supabase
      .from("missions")
      .update({ is_active: !m.active })
      .eq("id", m.id);
    if (error) setMissionsError(error.message);
    else setMissions((ms) => ms.map((x) => x.id === m.id ? { ...x, active: !x.active } : x));
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
        const { error } = await supabase
          .from("rewards")
          .update(payload)
          .eq("id", rewardModal.id);
        if (error) throw new Error(error.message);
        setRewards((rs) => rs.map((r) => r.id === rewardModal.id ? { ...r, ...data } : r));
      } else {
        const { data: created, error } = await supabase
          .from("rewards")
          .insert(payload)
          .select()
          .single();
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
    const { error } = await supabase
      .from("rewards")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) setRewardsError(error.message);
    else setRewards((rs) => rs.map((x) => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
  }

  // ── Redemption code confirm ─────────────────────────────────────────────────

  async function handleConfirmCode() {
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemResult(null);
    try {
      // Use server-side flow to confirm redemption and deduct points.
      const res = await loyaltyApi.confirmRedemption(redeemCode.trim());
      setRedeemResult({
        success: true,
        message: `Redeemed`,
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

  // ── Manual point deduction ──────────────────────────────────────────────────

  async function handleManualDeduct() {
    if (!manualEmail.trim() || !manualPoints) return;
    setManualLoading(true);
    setManualResult(null);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, points")
        .eq("full_name", manualEmail.trim()) // fallback: match by name
        .maybeSingle();

      if (profileError || !profile) throw new Error("Customer not found");

      const pts = Number(manualPoints);
      if (profile.points < pts) throw new Error("Customer has insufficient points");
      // Use the centralized RPC to deduct points (respects RLS and syncs)
      await (supabase.rpc as any)("deduct_points", {
        target_user_id: profile.id,
        amount: pts,
      }).throwOnError();

      // Fetch updated balance
      const { data: updated } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", profile.id)
        .single();

      setManualResult({
        success: true,
        message: `${pts} pts deducted`,
        customer_name: profile.full_name ?? "Customer",
        points_deducted: pts,
        new_balance: (updated as any).points,
      });
      setManualEmail("");
      setManualPoints("");
    } catch (e: any) {
      setManualResult({ success: false, message: e.message });
    } finally {
      setManualLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Engine</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Loyalty</h1>
      </div>

      <div className="flex gap-1 rounded-2xl bg-mist p-1">
        {(["missions", "rewards", "redeem"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "missions" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Missions</h2>
              <p className="text-xs text-muted-foreground">Challenges customers can complete for points.</p>
            </div>
            <button
              onClick={() => setMissionModal("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {missionsError && <ErrorBanner message={missionsError} />}
          {missionsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : missions.length === 0 ? (
            <EmptyState icon="🎯" title="No missions yet" sub="Create your first mission to engage customers." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {missions.map((m) => (
                <div key={m.id} className={`glass rounded-3xl p-5 transition-opacity ${m.active ? "" : "opacity-60"}`}>
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

      {tab === "rewards" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Rewards</h2>
              <p className="text-xs text-muted-foreground">Items customers can redeem with points.</p>
            </div>
            <button
              onClick={() => setRewardModal("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {rewardsError && <ErrorBanner message={rewardsError} />}
          {rewardsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rewards.length === 0 ? (
            <EmptyState icon="🎁" title="No rewards yet" sub="Add a reward so customers can redeem their points." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rewards.map((r) => (
                <div key={r.id} className={`glass rounded-3xl p-5 transition-opacity ${r.is_active ? "" : "opacity-60"}`}>
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

      {tab === "redeem" && (
        <section className="space-y-6">
          <div className="glass-strong rounded-3xl p-6">
            <h2 className="font-display text-2xl text-ink">Confirm code</h2>
            <p className="mt-1 text-xs text-muted-foreground">Enter the redemption code the customer shows you.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="Paste code here"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
              <button
                onClick={handleConfirmCode}
                disabled={redeemLoading || redeemCode.length < 6}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {redeemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm
              </button>
            </div>
            {redeemResult && <ResultBanner result={redeemResult} />}
          </div>

          <div className="glass-strong rounded-3xl p-6">
            <h2 className="font-display text-2xl text-ink">Manual deduct</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Deduct points by customer name (as registered in the app).
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="Customer full name"
                className={inputCls}
              />
              <input
                value={manualPoints}
                onChange={(e) => setManualPoints(e.target.value)}
                placeholder="Points to deduct"
                type="number"
                min={1}
                className={inputCls}
              />
              <button
                onClick={handleManualDeduct}
                disabled={manualLoading || !manualEmail.trim() || !manualPoints}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deduct points"}
              </button>
            </div>
            {manualResult && <ResultBanner result={manualResult} />}
          </div>
        </section>
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

function ResultBanner({ result }: { result: RedeemResult }) {
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${result.success ? "bg-emerald-50" : "bg-rose-50"}`}>
      {result.success
        ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
      <div>
        <p className={`text-sm font-medium ${result.success ? "text-emerald-700" : "text-rose-600"}`}>{result.message}</p>
        {result.success && result.customer_name && (
          <p className="mt-0.5 text-xs text-emerald-600">
            {result.customer_name}
            {result.points_deducted ? ` · −${result.points_deducted} pts` : ""}
            {result.new_balance !== undefined ? ` · New balance: ${result.new_balance} pts` : ""}
          </p>
        )}
      </div>
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

function IconBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors ${danger ? "hover:bg-rose-50 hover:text-rose-500" : "hover:bg-mist"}`}
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-ink">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-mist">
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
        <FieldLabel label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First 5 orders" className={inputCls} /></FieldLabel>
        <FieldLabel label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to customers" className={inputCls} /></FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Target orders"><input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} /></FieldLabel>
          <FieldLabel label="Points reward"><input type="number" min={1} value={reward} onChange={(e) => setReward(e.target.value)} className={inputCls} /></FieldLabel>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="h-10 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">Cancel</button>
          <button
            onClick={() => onSave({ title, description, target: Number(target), reward: Number(reward), active: initial?.active ?? true })}
            disabled={saving || !title.trim()}
            className="h-10 flex-1 rounded-2xl bg-ink text-sm font-medium text-primary-foreground disabled:opacity-50"
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
        <FieldLabel label="Reward name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free flat white" className={inputCls} /></FieldLabel>
        <FieldLabel label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the customer gets" className={inputCls} /></FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Points cost"><input type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} className={inputCls} /></FieldLabel>
          <FieldLabel label="Stock (-1 = unlimited)"><input type="number" min={-1} value={stock} onChange={(e) => setStock(e.target.value)} className={inputCls} /></FieldLabel>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="h-10 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">Cancel</button>
          <button
            onClick={() => onSave({ name, description, points_cost: Number(pointsCost), stock: Number(stock), is_active: initial?.is_active ?? true })}
            disabled={saving || !name.trim()}
            className="h-10 flex-1 rounded-2xl bg-ink text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
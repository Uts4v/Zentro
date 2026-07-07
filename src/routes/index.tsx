//routes/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, cartTotal, type MenuItem } from "@/lib/store";
import { merchantApi, menuApi, customerApi } from "@/lib/api";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { Plus, ShoppingBag, Flame, Trophy, Stamp, Loader2 } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";


export const Route = createFileRoute("/")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Zentro — Order" },
      { name: "description", content: "Browse the menu, order, and collect points." },
    ],
  }),
  component: Index,
});

function MenuItemCard({
  item,
  onAdd,
  disabled,
}: {
  item: MenuItem;
  onAdd: () => void;
  disabled: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.image_url && !imgError;
  const price = parseFloat(item.price as any);

  return (
    <article className="glass group relative flex flex-col rounded-3xl overflow-hidden">
      {hasImage ? (
        <img
          src={item.image_url!}
          alt={item.name}
          className="h-32 w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="mb-0 grid h-24 place-items-center rounded-t-3xl bg-mist text-5xl">
          {item.emoji || "☕"}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-semibold text-ink">{item.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-display text-xl text-ink">
            NPR {price.toLocaleString()}
          </span>
          <button
            onClick={onAdd}
            disabled={disabled}
            className="grid h-9 w-9 place-items-center rounded-full bg-ink text-primary-foreground transition-transform active:scale-90 disabled:opacity-40"
            aria-label={`Add ${item.name}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Index() {
  const { cart, add, selectedMerchantId, setSelectedMerchant } = useStore();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [merchantName, setMerchantName] = useState("Select a store");
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("All");

  useEffect(() => {
    async function init() {
      setLoading(true);

      try {
        const list = await merchantApi.list();
        console.log("[index] merchant list:", list);

        const available = list.filter((m) => m.is_open);
        console.log("[index] available merchants:", available);

        let merchantId = selectedMerchantId;

        if (merchantId) {
          const stillValid = available.find((m) => m.id === merchantId);
          if (!stillValid) {
            console.warn("[index] stored merchantId no longer valid, clearing");
            setSelectedMerchant(null);
            merchantId = null;
          }
        }

        if (!merchantId && available.length === 1) {
          merchantId = available[0].id;
          setSelectedMerchant(merchantId);
          console.log("[index] auto-selected merchant:", merchantId);
        }

        if (!merchantId) {
          setLoading(false);
          return;
        }

        const merchant = available.find((m) => m.id === merchantId);
        if (merchant) setMerchantName(merchant.store_name);

        const [items, profile] = await Promise.all([
          menuApi.forMerchant(merchantId).catch(() => [] as MenuItem[]),
          customerApi.profile().catch(() => null),
        ]);

        setMenuItems(items);
        if (profile) {
          setPoints(profile.loyalty_points);
          setStreak(profile.streak_days);
        }
      } catch (e) {
        console.error("[index] init error:", e);
      } finally {
        setLoading(false);
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMerchantId]);

  const categoryOrder = useMemo(() => {
    const seen: string[] = [];
    menuItems.forEach((m) => {
      const c = m.category?.trim() || "Other";
      if (!seen.includes(c)) seen.push(c);
    });
    return seen;
  }, [menuItems]);

  const cats = ["All", ...categoryOrder];
  const items = cat === "All" ? menuItems : menuItems.filter((m) => (m.category?.trim() || "Other") === cat);

  const groupedItems = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    items.forEach((m) => {
      const c = m.category?.trim() || "Other";
      if (!groups[c]) groups[c] = [];
      groups[c].push(m);
    });
    return groups;
  }, [items]);

  const visibleCategories = cat === "All" ? categoryOrder : categoryOrder.filter((c) => c === cat);

  function scrollToCategory(c: string) {
    setCat("All");
    requestAnimationFrame(() => {
      const el = document.getElementById(`menu-cat-${c}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const count = cart.reduce((s, c) => s + c.qty, 0);
  const storeItems = menuItems.map((m) => ({ ...m, price: parseFloat(m.price as any) }));
  const total = cartTotal(cart, storeItems);

  return (
    <MobileShell>
      <TopBar />

      {/* Merchant hero */}
      <section className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-[28px] p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full gradient-ember opacity-30 blur-3xl" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {selectedMerchantId ? "Now open" : "Select a store to start"}
          </p>
          <h1 className="font-display mt-2 text-[44px] leading-[1] text-ink">
            {merchantName}
          </h1>
          {selectedMerchantId && (
            <div className="mt-5 flex items-center gap-2">
              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
                <Flame className="h-3 w-3 stroke-ember" /> {streak}-day streak
              </span>
              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
                ✦ {points} pts
              </span>
            </div>
          )}
          {!selectedMerchantId && !loading && (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link to="/stores" className="text-ember underline">
                Browse stores
              </Link>{" "}
              to start ordering.
            </p>
          )}
        </div>
      </section>

      {/* Category filter */}
      {selectedMerchantId && !loading && (
        <PunchCardSection merchantId={selectedMerchantId} />
      )}
      {menuItems.length > 0 && (
        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-5 pb-1">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => (c === "All" ? setCat("All") : scrollToCategory(c))}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                cat === c
                  ? "bg-ink text-primary-foreground shadow-soft"
                  : "glass text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Menu — grouped into sections by category */}
      <section className="mt-3 px-5 pb-32">
        {loading && (
          <p className="text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {!loading && !selectedMerchantId && (
          <p className="text-center text-sm text-muted-foreground">
            Select a store to see the menu.
          </p>
        )}
        {!loading && selectedMerchantId && menuItems.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No menu items available.
          </p>
        )}
        {!loading && items.length > 0 && (
          <div className="space-y-8">
            {visibleCategories.map((c) => (
              <div key={c} id={`menu-cat-${c}`} className="scroll-mt-24">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{c}</h2>
                  <span className="text-[11px] text-muted-foreground">
                    {groupedItems[c].length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {groupedItems[c].map((m) => (
                    <MenuItemCard
                      key={m.id}
                      item={m}
                      onAdd={() => add(m.id)}
                      disabled={!selectedMerchantId}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Floating cart bar */}
      {count > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-0 bottom-24 z-40 mx-auto flex max-w-[440px] items-center justify-between rounded-full bg-ink px-5 py-3 text-primary-foreground shadow-ember"
          style={{ marginLeft: "auto", marginRight: "auto", width: "calc(100% - 32px)" }}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingBag className="h-4 w-4" /> {count}{" "}
            {count === 1 ? "item" : "items"}
          </span>
          <span className="font-display text-lg">NPR {total.toLocaleString()} →</span>
        </Link>
      )}
    </MobileShell>
  );
}


// Add this component at the bottom of the file
function PunchCardSection({ merchantId }: { merchantId: string }) {
  const [punchCard, setPunchCard] = useState<any>(null);
  const [punchesRequired, setPunchesRequired] = useState(5);
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimCard, setClaimCard] = useState<{
    code: string; missionTitle: string; rewardLabel: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [card, merchantRes, missionsRes] = await Promise.all([
          customerApi.getPunchCard(merchantId),
          supabase
            .from("merchant_profiles")
            .select("punches_to_free")
            .eq("id", merchantId)
            .single(),
          supabase
            .from("punch_missions")
            .select("*")
            .eq("merchant_id", merchantId)
            .eq("is_active", true)
            .order("punches_required"),
        ]);
        setPunchCard(card);
        setPunchesRequired(merchantRes.data?.punches_to_free ?? 5);
        setMissions(missionsRes.data ?? []);
      } catch (e) {
        console.error("Punch card load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [merchantId]);

  async function claimMission(mission: any) {
    setClaiming(mission.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("claim_punch_reward", {
        p_customer_id: user.id,
        p_merchant_id: merchantId,
        p_mission_id: mission.id,
      });

      if (error) throw new Error(error.message);

      setClaimCard({
        code: data as string,
        missionTitle: mission.title,
        rewardLabel: mission.reward_label,
      });

      const updated = await customerApi.getPunchCard(merchantId);
      setPunchCard(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return null;
  if (!punchCard) return null;

  const punches = punchCard.punch_count ?? 0;

  return (
    <section className="px-5 mt-4">
      {/* Claim card overlay */}
      {claimCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
              <Trophy className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Show this to your merchant
            </p>
            <h2 className="font-display mt-2 text-3xl text-ink">Claim your reward!</h2>
            <p className="mt-2 text-sm text-muted-foreground">{claimCard.missionTitle}</p>
            <div className="mt-6 rounded-2xl bg-ink p-4">
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">
                {claimCard.code}
              </p>
            </div>
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">🎁 {claimCard.rewardLabel}</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              This code expires in 10 minutes. Show it to the merchant to confirm.
            </p>
            <button
              onClick={() => setClaimCard(null)}
              className="mt-6 h-12 w-full rounded-2xl bg-ink text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Punch card */}
      <div className="glass-strong rounded-[28px] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Stamp className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-ink">Punch Card</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {punches} / {punchesRequired} punches
          </p>
        </div>

        {/* Punch dots */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Array.from({ length: punchesRequired }).map((_, i) => (
            <div
              key={i}
              className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-all ${
                i < punches
                  ? "bg-ink text-white shadow-soft scale-105"
                  : "border-2 border-dashed border-border text-muted-foreground/40"
              }`}
            >
              {i < punches ? "✓" : i + 1}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-mist overflow-hidden mb-5">
          <div
            className="h-full rounded-full bg-ink transition-all duration-500"
            style={{ width: `${Math.min(100, (punches / punchesRequired) * 100)}%` }}
          />
        </div>

        {/* Missions */}
        {missions.length > 0 && (
          <div className="space-y-2">
            {missions.map((mission) => {
              const completed = punches >= mission.punches_required;
              return (
                <div
                  key={mission.id}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                    completed ? "bg-emerald-50 border border-emerald-200" : "bg-mist"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${completed ? "text-emerald-700" : "text-ink"}`}>
                      {mission.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mission.punches_required} punches → 🎁 {mission.reward_label}
                    </p>
                  </div>
                  {completed ? (
                    <button
                      onClick={() => claimMission(mission)}
                      disabled={claiming === mission.id}
                      className="ml-3 shrink-0 inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {claiming === mission.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>🎁 Claim</>
                      )}
                    </button>
                  ) : (
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                      {mission.punches_required - punches} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, cartTotal, type MenuItem } from "@/lib/store";
import { merchantApi, menuApi, customerApi } from "@/lib/api";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { Plus, ShoppingBag, Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { requireAuth } from "@/lib/auth-guard";

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
        // Always fetch the merchant list first — this is cheap and confirms
        // the stored selectedMerchantId is still valid (not stale from
        // a previous session with a different user).
        const list = await merchantApi.list();
        console.log("[index] merchant list:", list);

        // Filter to open + approved merchants
        const available = list.filter((m) => m.is_open);
        console.log("[index] available merchants:", available);

        // Determine which merchant to use
        let merchantId = selectedMerchantId;

        // Validate that the stored ID still exists in the list
        if (merchantId) {
          const stillValid = available.find((m) => m.id === merchantId);
          if (!stillValid) {
            console.warn("[index] stored merchantId no longer valid, clearing");
            setSelectedMerchant(null);
            merchantId = null;
          }
        }

        // Auto-select if only one available and none selected
        if (!merchantId && available.length === 1) {
          merchantId = available[0].id;
          setSelectedMerchant(merchantId);
          console.log("[index] auto-selected merchant:", merchantId);
        }

        // If still no merchant (multiple available, none selected) — stop here
        if (!merchantId) {
          setLoading(false);
          return;
        }

        // Load menu + profile in parallel
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
    // Only re-run when selectedMerchantId changes — not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMerchantId]);

  const cats = ["All", ...Array.from(new Set(menuItems.map((m) => m.category).filter(Boolean)))];
  const items = cat === "All" ? menuItems : menuItems.filter((m) => m.category === cat);
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
      {menuItems.length > 0 && (
        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-5 pb-1">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
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

      {/* Menu grid */}
      <section className="mt-3 grid grid-cols-2 gap-3 px-5 pb-32">
        {loading && (
          <p className="col-span-2 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {!loading && !selectedMerchantId && (
          <p className="col-span-2 text-center text-sm text-muted-foreground">
            Select a store to see the menu.
          </p>
        )}
        {!loading && selectedMerchantId && menuItems.length === 0 && (
          <p className="col-span-2 text-center text-sm text-muted-foreground">
            No menu items available.
          </p>
        )}
        {items.map((m) => (
          <MenuItemCard
            key={m.id}
            item={m}
            onAdd={() => add(m.id)}
            disabled={!selectedMerchantId}
          />
        ))}
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
// routes/customer/order.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ShoppingCart, Plus, Minus, X, Loader2, Star, Zap } from "lucide-react";
import { menuApi, orderApi, merchantApi, type MenuItem, type MerchantProfile } from "@/lib/api";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/customer/order")({
  head: () => ({ meta: [{ title: "Order · Zentro" }] }),
  component: CustomerOrder,
});

interface CartItem {
  item: MenuItem;
  qty: number;
}

function CustomerOrder() {
  if (typeof window === "undefined") return null;

  const { setSelectedMerchant } = useStore();

  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [selectedMerchant, setLocalMerchant] = useState<MerchantProfile | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ orderId: string; points: number } | null>(null);

  // Load merchants
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await merchantApi.list();
        const merchantList = Array.isArray(data) ? data : (data as any).results ?? [];
        const open = merchantList.filter((m: MerchantProfile) => m.is_open);
        setMerchants(open);
        if (open.length === 1) selectMerchant(open[0]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function selectMerchant(m: MerchantProfile) {
    setLocalMerchant(m);
    // FIX: also sync to global store so loyalty page knows which merchant
    setSelectedMerchant(m.id);
    setCart([]);
    setFilterCat("All");
    setMenuLoading(true);
    try {
      const items = await menuApi.forMerchant(m.id);
      setMenu(items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMenuLoading(false);
    }
  }

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { item, qty: 1 }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === itemId);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter((c) => c.item.id !== itemId);
      return prev.map((c) => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c);
    });
  }

  function clearFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }

  const totalAmount = useMemo(
    () => cart.reduce((sum, c) => sum + Number(c.item.price) * c.qty, 0),
    [cart]
  );

  const totalPoints = useMemo(
    () => cart.reduce((sum, c) => sum + (c.item.loyalty_reward ? c.item.points_per_item * c.qty : 0), 0),
    [cart]
  );

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  // ── Category grouping ──────────────────────────────────────────────────
  // Groups menu items by their `category` field. Only categories that
  // actually have at least one item show up — nothing hardcoded, fully
  // driven by whatever the merchant has set on their items. Items with no
  // category fall into "Other" so nothing silently disappears.
  const groupedMenu = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    menu.forEach((item) => {
      const cat = item.category?.trim() || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [menu]);

  // Preserve first-seen order of categories as they appear in the menu data
  const categoryOrder = useMemo(() => {
    const seen: string[] = [];
    menu.forEach((item) => {
      const cat = item.category?.trim() || "Other";
      if (!seen.includes(cat)) seen.push(cat);
    });
    seen.sort((a, b) => {
      const isABasic = a.toLowerCase() === "basic";
      const isBBasic = b.toLowerCase() === "basic";
      if (isABasic && !isBBasic) return -1;
      if (!isABasic && isBBasic) return 1;
      return 0;
    });
    return seen;
  }, [menu]);

  const categories = useMemo(() => ["All", ...categoryOrder], [categoryOrder]);

  // Which category sections to render: all of them, or just the one selected
  const visibleCategories = filterCat === "All" ? categoryOrder : categoryOrder.filter((c) => c === filterCat);

  const visibleMenu = filterCat === "All" ? menu : menu.filter((i) => (i.category?.trim() || "Other") === filterCat);

  function scrollToCategory(cat: string) {
    setFilterCat("All");
    // wait a tick for the "All" view to render before scrolling
    requestAnimationFrame(() => {
      const el = document.getElementById(`menu-cat-${cat}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function placeOrder() {
    if (!selectedMerchant || cart.length === 0) return;
    setPlacing(true);
    setError("");
    try {
      const order = await orderApi.create({
        merchant_id: selectedMerchant.id,
        items: cart.map((c) => ({
          menu_item_id: c.item.id,
          quantity: c.qty,
          name: c.item.name,
          price: parseFloat(c.item.price),
          points_per_item: c.item.points_per_item ?? 0,
        })),
        notes,
      });
      setSuccess({ orderId: order.id, points: order.points_earned });
      setCart([]);
      setNotes("");
      setCartOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
        <div className="glass-strong rounded-3xl p-10">
          <p className="text-6xl">🎉</p>
          <h2 className="font-display mt-4 text-3xl text-ink">Order placed!</h2>
          <p className="mt-2 text-muted-foreground">
            Order <span className="font-medium text-ink">#{success.orderId}</span> is being prepared
          </p>
          {success.points > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700">
              <Zap className="h-4 w-4" />
              +{success.points} loyalty points earned
            </div>
          )}
          <button
            onClick={() => setSuccess(null)}
            className="gradient-ember mt-8 h-11 w-full rounded-2xl text-sm font-medium text-white"
          >
            Order again
          </button>
        </div>
      </div>
    );
  }

  // ── Merchant picker ───────────────────────────────────────────────────────
  if (!selectedMerchant) {
    return (
      <div className="space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Browse</p>
          <h1 className="font-display mt-1 text-5xl text-ink">Order</h1>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : merchants.length === 0 ? (
          <div className="glass rounded-3xl py-16 text-center text-sm text-muted-foreground">
            No stores are open right now
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {merchants.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMerchant(m)}
                className="glass-strong rounded-3xl p-6 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {m.logo_url && (
                  <img
                    src={m.logo_url}
                    alt={m.store_name}
                    className="mb-3 h-12 w-12 rounded-xl object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <h3 className="font-display text-2xl text-ink">{m.store_name}</h3>
                {m.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{m.description}</p>
                )}
                <span className="mt-3 inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
                  Open now
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main ordering UI ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <button
            onClick={() => setLocalMerchant(null)}
            className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-ink"
          >
            ← Back
          </button>
          <h1 className="font-display mt-1 text-5xl text-ink">{selectedMerchant.store_name}</h1>
        </div>

        {/* Cart button */}
        <button
          onClick={() => setCartOpen(true)}
          className="relative inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-5 text-sm font-medium text-primary-foreground"
        >
          <ShoppingCart className="h-4 w-4" />
          Cart
          {cartCount > 0 && (
            <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button onClick={() => setError("")} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Category tabs — jump-links into the sections below */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => (cat === "All" ? setFilterCat("All") : scrollToCategory(cat))}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                filterCat === cat
                  ? "bg-ink text-primary-foreground"
                  : "bg-mist text-ink hover:bg-ink/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Menu — grouped into sections by category */}
      {menuLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visibleMenu.length === 0 ? (
        <div className="glass rounded-3xl py-16 text-center text-sm text-muted-foreground">
          No items available
        </div>
      ) : (
        <div className="space-y-10">
          {visibleCategories.map((cat) => (
            <section key={cat} id={`menu-cat-${cat}`} className="scroll-mt-24">
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="font-display text-2xl text-ink">{cat}</h2>
                <span className="text-xs text-muted-foreground">
                  {groupedMenu[cat].length} {groupedMenu[cat].length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupedMenu[cat].map((item) => {
                  const inCart = cart.find((c) => c.item.id === item.id);
                  return (
                    <MenuCard
                      key={item.id}
                      item={item}
                      qty={inCart?.qty ?? 0}
                      onAdd={() => addToCart(item)}
                      onRemove={() => removeFromCart(item.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Floating cart summary bar */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <button
            onClick={() => setCartOpen(true)}
            className="gradient-ember inline-flex items-center gap-4 rounded-2xl px-6 py-3.5 text-sm font-medium text-white shadow-lg"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-xs font-bold">
              {cartCount}
            </span>
            View cart
            <span>NPR {totalAmount.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}
        >
          <div className="glass-strong w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Your cart</h2>
              <button
                onClick={() => setCartOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-mist text-muted-foreground hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
              {cart.map(({ item, qty }) => (
                <div key={item.id} className="flex items-center gap-3">
                  {/* FIX: show image in cart if available, else emoji */}
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-mist text-xl">
                        {item.emoji}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      NPR {Number(item.price).toLocaleString()} each
                      {item.loyalty_reward && (
                        <span className="ml-2 text-emerald-600">+{item.points_per_item * qty} pts</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-mist text-ink"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-sm font-medium text-ink">{qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-mist text-ink"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => clearFromCart(item.id)}
                      className="ml-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm text-ink">
                    NPR {(Number(item.price) * qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                Special notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra hot, no sugar…"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-white/50 px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </div>

            {/* Summary */}
            <div className="mt-4 space-y-1.5 rounded-2xl bg-mist p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-ink">NPR {totalAmount.toLocaleString()}</span>
              </div>
              {totalPoints > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Points you'll earn</span>
                  <span className="font-medium text-emerald-600">+{totalPoints} pts</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 font-medium">
                <span className="text-ink">Total</span>
                <span className="font-display text-lg text-ink">NPR {totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing || cart.length === 0}
              className="gradient-ember mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-white disabled:opacity-50"
            >
              {placing && <Loader2 className="h-4 w-4 animate-spin" />}
              Place order · NPR {totalAmount.toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Menu item card ────────────────────────────────────────────────────────────
function MenuCard({
  item,
  qty,
  onAdd,
  onRemove,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  // FIX: track per-image load errors so we fall back to emoji gracefully
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.image_url && !imgError;

  return (
    <article className="glass-strong rounded-3xl overflow-hidden">
      {/* Image / emoji header */}
      {hasImage ? (
        <img
          src={item.image_url}
          alt={item.name}
          className="h-40 w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="flex h-32 items-center justify-center bg-mist text-5xl">
          {item.emoji}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              {/* Show emoji next to name only when there's already a photo */}
              {hasImage && <span className="text-lg">{item.emoji}</span>}
              <h3 className="font-display text-lg leading-tight text-ink">{item.name}</h3>
              {item.is_featured && (
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </div>
            {item.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
            )}
          </div>
          <p className="font-display shrink-0 text-lg text-ink">
            NPR {Number(item.price).toLocaleString()}
          </p>
        </div>

        {item.loyalty_reward && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <Zap className="h-2.5 w-2.5" />
            +{item.points_per_item} pts per item
          </div>
        )}

        {/* Qty controls */}
        <div className="mt-4">
          {qty === 0 ? (
            <button
              onClick={onAdd}
              className="gradient-ember h-10 w-full rounded-xl text-sm font-medium text-white transition-transform active:scale-[0.98]"
            >
              Add to cart
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-mist px-2 py-1.5">
              <button
                onClick={onRemove}
                className="grid h-8 w-8 place-items-center rounded-lg bg-white text-ink shadow-sm"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="font-display text-lg text-ink">{qty}</span>
              <button
                onClick={onAdd}
                className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-primary-foreground shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
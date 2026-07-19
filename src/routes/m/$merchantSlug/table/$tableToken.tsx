import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { ArrowLeft, Loader2, UtensilsCrossed, ShoppingCart, Plus, Minus, Zap, Search, X, Check, Gift, Sparkles, UserPlus } from "lucide-react";
import { publicTableApi, menuApi, guestOrderApi, type MerchantProfile, type MenuItem, type MerchantTable } from "@/lib/api";
import { useStore, cartTotal, cartPoints, saveTableContext, loadTableContext, type TableOrderContext } from "@/lib/store";
import { useState, useEffect, useMemo } from "react";

export const Route = createFileRoute("/m/$merchantSlug/table/$tableToken")({
  head: () => ({ meta: [{ title: "Scan to Order" }] }),
  component: TableQRPage,
});

function TableMenuItem({
  item,
  onAdd,
  onRemove,
  qty,
  addedId,
}: {
  item: MenuItem;
  onAdd: () => void;
  onRemove: () => void;
  qty: number;
  addedId: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.image_url && !imgError;
  const price = parseFloat(item.price);

  return (
    <article
      className={`glass-strong group relative flex flex-col overflow-hidden rounded-3xl transition-all ${
        qty > 0 ? "ring-1 ring-ink/10" : ""
      }`}
    >
      {hasImage ? (
        <img
          src={item.image_url!}
          alt={item.name}
          className="h-32 w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="grid h-24 place-items-center bg-mist text-5xl">
          {item.emoji || "🍽️"}
        </div>
      )}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-semibold leading-tight text-ink">{item.name}</h3>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="font-display text-base text-ink">
              NPR {price.toLocaleString()}
            </span>
            {item.points_per_item > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-ember-soft px-1.5 py-0.5 text-[10px] font-medium text-ember">
                <Zap className="h-2.5 w-2.5" /> {item.points_per_item}
              </span>
            )}
          </div>
          {qty === 0 ? (
            <button
              onClick={onAdd}
              className={`grid h-9 w-9 place-items-center rounded-full transition-all ${
                addedId === item.id
                  ? "bg-emerald-500 text-white scale-110"
                  : "bg-ink text-primary-foreground active:scale-95"
              }`}
            >
              {addedId === item.id ? (
                <span className="text-xs">✓</span>
              ) : (
                <Plus className="h-4 w-4" strokeWidth={2.4} />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-mist px-1 py-0.5">
              <button
                onClick={onRemove}
                className="grid h-7 w-7 place-items-center rounded-full bg-background text-ink shadow-sm active:scale-95"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center font-display text-base text-ink">{qty}</span>
              <button
                onClick={onAdd}
                className="grid h-7 w-7 place-items-center rounded-full bg-ink text-primary-foreground shadow-sm active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function TableQRPage() {
  if (typeof window === "undefined") return null;

  const { merchantSlug, tableToken } = Route.useParams();
  const nav = useNavigate();

  const [merchant, setMerchant] = useState<Pick<MerchantProfile, "id" | "store_name" | "store_slug" | "logo_url"> | null>(null);
  const [table, setTable] = useState<Pick<MerchantTable, "id" | "name" | "table_number" | "public_token"> | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addedId, setAddedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState("");

  const { cart, add, remove, setSelectedMerchant, setTableContext, tableContext, clearCart } = useStore();

  useEffect(() => {
    resolve();
  }, [merchantSlug, tableToken]);

  async function resolve() {
    setLoading(true);
    setError("");
    try {
      const result = await publicTableApi.resolve(merchantSlug, tableToken);
      setMerchant(result.merchant);
      setTable(result.table);

      setSelectedMerchant(result.merchant.id);

      const ctx: TableOrderContext = {
        merchantSlug,
        tableToken,
        tableId: result.table.id,
        tableName: result.table.name,
        scannedAt: Date.now(),
      };
      setTableContext(ctx);
      saveTableContext(merchantSlug, ctx);

      const menuItems = await menuApi.forMerchant(result.merchant.id);
      setItems(menuItems);
    } catch (e: any) {
      setError(e.message || "Invalid QR code");
    } finally {
      setLoading(false);
    }
  }

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const menuItems = useMemo(
    () =>
      searchFiltered.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: parseFloat(i.price),
        category: i.category,
        emoji: i.emoji,
        points_per_item: i.points_per_item,
        is_available: i.is_available,
        image_url: i.image_url,
      })),
    [searchFiltered]
  );

  const total = cartTotal(cart, menuItems);
  const points = cartPoints(cart, menuItems);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(searchFiltered.map((i) => i.category).filter(Boolean)));
    return ["All", ...cats];
  }, [searchFiltered]);

  const groupedItems = useMemo(() => {
    if (activeCategory !== "All") {
      const filtered = searchFiltered.filter((i) => i.category === activeCategory);
      return { [activeCategory]: filtered };
    }
    return searchFiltered.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const cat = item.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [searchFiltered, activeCategory]);

  function handleAdd(item: MenuItem) {
    setSelectedMerchant(merchant!.id);
    add(item.id);
    setAddedId(item.id);
    setTimeout(() => setAddedId(null), 800);
  }

  async function handleGuestCheckout() {
    if (placing || !merchant || !table) return;
    setPlacing(true);
    setPlaceError("");
    try {
      const orderItems = cart
        .map((c) => {
          const mi = items.find((m) => m.id === c.itemId);
          if (!mi) return null;
          return {
            menu_item_id: c.itemId,
            quantity: c.qty,
            name: mi.name,
            price: parseFloat(mi.price),
          };
        })
        .filter(Boolean) as { menu_item_id: string; quantity: number; name: string; price: number }[];

      if (orderItems.length === 0) throw new Error("Cart is empty");

      const order = await guestOrderApi.create({
        merchant_id: merchant.id,
        table_token: tableToken,
        items: orderItems,
        guest_name: guestName.trim(),
      });

      clearCart();
      setOrderPlaced(order.id);
    } catch (e: any) {
      setPlaceError(e.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-3 py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading table…</p>
        </div>
      </MobileShell>
    );
  }

  if (error || !merchant || !table) {
    return (
      <MobileShell>
        <TopBar
          right={
            <Link to="/" className="glass grid h-9 w-9 place-items-center rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
        <div className="px-5 pt-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || "Invalid table QR code"}
          </div>
          <button
            onClick={() => nav({ to: "/" })}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-primary-foreground"
          >
            Go home
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <TopBar />

      {/* Search bar — always visible */}
      <div className="px-5 pt-3 pb-1">
        <div className="glass-strong flex items-center gap-2 rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted-foreground focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="shrink-0">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Table context banner */}
      <div className="bg-ink px-5 py-4 text-primary-foreground">
        <div className="flex items-center gap-3">
          {merchant.logo_url ? (
            <img
              src={merchant.logo_url}
              alt={merchant.store_name}
              className="h-10 w-10 rounded-xl object-cover ring-2 ring-white/20"
            />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-lg">
              ☕
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg">{merchant.store_name}</p>
            <div className="flex items-center gap-2 text-sm text-white/70">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              <span>Dine-in · {table.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loyalty promo banner */}
      <Link
        to="/auth/"
        search={{ redirect: `/m/${merchantSlug}/table/${tableToken}` }}
        className="mx-5 mt-3 block overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
            <Gift className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Want to earn loyalty points?
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-amber-700/80">
              Sign up free — earn points, unlock rewards, get exclusive offers!
            </p>
          </div>
          <UserPlus className="h-4 w-4 shrink-0 text-amber-600" />
        </div>
        <div className="flex gap-2 border-t border-amber-200/40 bg-amber-100/30 px-4 py-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-amber-800">
            <Sparkles className="h-2.5 w-2.5" /> Earn points
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-amber-800">
            <Gift className="h-2.5 w-2.5" /> Free rewards
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-amber-800">
            <Zap className="h-2.5 w-2.5" /> Exclusive deals
          </span>
        </div>
      </Link>

      {/* Category tabs */}
      {categories.length > 2 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                activeCategory === cat
                  ? "bg-ink text-primary-foreground shadow-soft"
                  : "glass text-muted-foreground hover:text-ink"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Menu */}
      <div className="mt-4 pb-36">
        {items.length === 0 ? (
          <div className="mx-5 glass rounded-3xl py-16 text-center">
            <p className="text-4xl">📋</p>
            <p className="mt-3 font-display text-lg text-ink">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Menu is being prepared</p>
          </div>
        ) : search.trim() && searchFiltered.length === 0 ? (
          <p className="px-5 text-center text-sm text-muted-foreground">
            No items match "{search}"
          </p>
        ) : (
          <div className="space-y-6 px-5">
            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <div key={cat}>
                {activeCategory === "All" && (
                  <div className="mb-3 flex items-baseline gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-ink">{cat}</p>
                    <span className="text-[11px] text-muted-foreground">{catItems.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {catItems.map((item) => {
                    const qty = cart.find((c) => c.itemId === item.id)?.qty ?? 0;
                    return (
                      <TableMenuItem
                        key={item.id}
                        item={item}
                        qty={qty}
                        addedId={addedId}
                        onAdd={() => handleAdd(item)}
                        onRemove={() => remove(item.id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && !orderPlaced && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-[440px] px-4">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-ink px-5 py-4 text-primary-foreground shadow-ember transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-ember text-[9px] font-bold">
                  {cartCount}
                </span>
              </div>
              <span className="text-sm font-medium">
                {cartCount} item{cartCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {points > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                  <Zap className="h-3 w-3" /> +{points} pts
                </span>
              )}
              <span className="font-display text-lg">NPR {total.toLocaleString()} →</span>
            </div>
          </button>
        </div>
      )}

      {/* Order placed confirmation */}
      {orderPlaced && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h2 className="mt-4 font-display text-2xl text-ink">Order placed!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your order has been sent to the kitchen. A staff member will confirm shortly.
            </p>
            <div className="mt-4 rounded-2xl bg-mist px-4 py-3 text-xs text-muted-foreground">
              Order #{orderPlaced.slice(0, 8)}
              {table && <> · {table.name}</>}
            </div>
            <button
              onClick={() => { setOrderPlaced(null); setCheckoutOpen(false); }}
              className="mt-6 h-11 w-full rounded-full bg-ink text-sm font-medium text-primary-foreground"
            >
              Back to menu
            </button>
          </div>
        </div>
      )}

      {/* Guest checkout modal */}
      {checkoutOpen && !orderPlaced && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="glass-strong w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-ink">Checkout</h2>
              <button
                onClick={() => { setCheckoutOpen(false); setPlaceError(""); }}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Order summary */}
            <div className="mt-4 max-h-40 space-y-2 overflow-y-auto">
              {cart.map((c) => {
                const item = items.find((m) => m.id === c.itemId);
                return (
                  <div key={c.itemId} className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      {item?.emoji || "🍽️"} {item?.name || "Item"} ×{c.qty}
                    </span>
                    <span className="text-muted-foreground">
                      NPR {item ? (parseFloat(item.price) * c.qty).toLocaleString() : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="my-3 border-t border-border" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Total</span>
              <span className="font-display text-xl text-ink">NPR {total.toLocaleString()}</span>
            </div>

            {/* Guest name input */}
            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground">Your name (optional)</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Ram"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            {placeError && (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {placeError}
              </div>
            )}

            <button
              onClick={handleGuestCheckout}
              disabled={placing}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {placing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
                </>
              ) : (
                `Place order · NPR ${total.toLocaleString()}`
              )}
            </button>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {guestName.trim() ? `Ordering as ${guestName.trim()}` : "Ordering as guest"}
              {table ? ` · ${table.name}` : ""}
            </p>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

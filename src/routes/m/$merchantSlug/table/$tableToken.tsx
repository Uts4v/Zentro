import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import {
  ArrowLeft,
  Loader2,
  UtensilsCrossed,
  ShoppingCart,
  Plus,
  Minus,
  Zap,
  Search,
  X,
  Check,
  Gift,
  Sparkles,
  UserPlus,
  Leaf,
} from "lucide-react";
import { publicTableApi, menuApi, guestOrderApi, orderApi, type MerchantProfile, type MenuItem, type MerchantTable } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useStore, cartTotal, cartPoints, saveTableContext, loadTableContext, type TableOrderContext } from "@/lib/store";
import { useState, useEffect, useMemo } from "react";

export const Route = createFileRoute("/m/$merchantSlug/table/$tableToken")({
  head: () => ({ meta: [{ title: "Scan to Order" }] }),
  component: TableQRPage,
});

/** Subtle contour-line watermark, evokes tea-estate hillsides. Purely decorative. */
function ContourMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M-10 120 Q 60 80 120 110 T 250 90 T 410 115" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M-10 140 Q 70 100 140 132 T 260 112 T 410 138" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path d="M-10 100 Q 50 60 130 90 T 240 68 T 410 94" stroke="currentColor" strokeWidth="1" opacity="0.25" />
    </svg>
  );
}

function TableMenuItem({
  item,
  onAdd,
  onRemove,
  qty,
  addedId,
  index,
}: {
  item: MenuItem;
  onAdd: () => void;
  onRemove: () => void;
  qty: number;
  addedId: string | null;
  index: number;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.image_url && !imgError;
  const price = parseFloat(item.price);

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-background/80 backdrop-blur-sm transition-all duration-300 ease-out animate-[riseIn_0.45s_ease-out_backwards] ${
        qty > 0
          ? "border-amber-300/70 shadow-[0_8px_28px_-12px_rgba(120,90,20,0.35)]"
          : "border-border/60 shadow-[0_4px_16px_-10px_rgba(20,20,15,0.25)] hover:border-amber-200/70 hover:shadow-[0_10px_24px_-12px_rgba(120,90,20,0.28)]"
      }`}
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className="relative">
        {hasImage ? (
          <img
            src={item.image_url!}
            alt={item.name}
            className="h-32 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="grid h-24 place-items-center bg-gradient-to-br from-mist to-mist/60 text-4xl">
            <span className="opacity-90">{item.emoji || "🍃"}</span>
          </div>
        )}
        {hasImage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/25 to-transparent" />
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="text-sm font-semibold leading-tight tracking-tight text-ink">{item.name}</h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{item.description}</p>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[15px] tracking-tight text-ink">
              NPR {price.toLocaleString()}
            </span>
            {item.points_per_item > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/70">
                <Zap className="h-2.5 w-2.5" strokeWidth={2.5} /> {item.points_per_item}
              </span>
            )}
          </div>

          {qty === 0 ? (
            <button
              onClick={onAdd}
              aria-label={`Add ${item.name}`}
              className={`grid h-9 w-9 place-items-center rounded-full transition-all duration-200 ${
                addedId === item.id
                  ? "scale-110 bg-emerald-500 text-white"
                  : "bg-ink text-primary-foreground shadow-sm active:scale-90"
              }`}
            >
              {addedId === item.id ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={2.4} />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-mist px-1 py-0.5 ring-1 ring-inset ring-border/50">
              <button
                onClick={onRemove}
                aria-label={`Remove one ${item.name}`}
                className="grid h-7 w-7 place-items-center rounded-full bg-background text-ink shadow-sm transition-transform active:scale-90"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center font-display text-base tabular-nums text-ink">{qty}</span>
              <button
                onClick={onAdd}
                aria-label={`Add one more ${item.name}`}
                className="grid h-7 w-7 place-items-center rounded-full bg-ink text-primary-foreground shadow-sm transition-transform active:scale-90"
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
  const { user, profile } = useAuth();

  const [merchant, setMerchant] = useState<Pick<MerchantProfile, "id" | "store_name" | "store_slug" | "logo_url"> | null>(null);
  const [table, setTable] = useState<(Pick<MerchantTable, "id" | "name" | "table_number" | "public_token"> & { room_name?: string }) | null>(null);
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

  async function handleCheckout() {
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
            points_per_item: mi.points_per_item,
          };
        })
        .filter(Boolean) as { menu_item_id: string; quantity: number; name: string; price: number; points_per_item: number }[];

      if (orderItems.length === 0) throw new Error("Cart is empty");

      let order;
      if (user) {
        order = await orderApi.create({
          merchant_id: merchant.id,
          items: orderItems,
          order_type: "dine_in",
          table_token: tableToken,
        });
      } else {
        order = await guestOrderApi.create({
          merchant_id: merchant.id,
          table_token: tableToken,
          items: orderItems,
          guest_name: guestName.trim(),
        });
      }

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
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <div className="relative grid h-14 w-14 place-items-center rounded-full bg-mist">
            <Leaf className="h-6 w-6 animate-pulse text-amber-600" strokeWidth={1.75} />
            <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-amber-300/60" />
          </div>
          <p className="text-xs tracking-wide text-muted-foreground">Steeping your menu…</p>
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
      <style>{`
        @keyframes riseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeScale { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <TopBar />

      {/* Table context banner */}
      <div className="relative overflow-hidden bg-gradient-to-b from-ink to-[#14201a] px-5 pb-5 pt-4 text-primary-foreground">
        <ContourMark className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-white/10" />
        <div className="relative flex items-center gap-3">
          {merchant.logo_url ? (
            <img
              src={merchant.logo_url}
              alt={merchant.store_name}
              className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/15"
            />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-lg ring-2 ring-white/15">
              <Leaf className="h-5 w-5 text-amber-300" strokeWidth={1.75} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl tracking-tight">{merchant.store_name}</p>
            <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/75">
              <UtensilsCrossed className="h-3 w-3" />
              <span>Dine-in{table.room_name ? ` · ${table.room_name}` : ""} · {table.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative -mt-3 px-5">
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/95 px-4 py-3 shadow-[0_10px_30px_-14px_rgba(20,20,15,0.35)] backdrop-blur-sm">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted-foreground focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="shrink-0 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loyalty promo banner — only for guests */}
      {!user && (
        <Link
          to="/auth/"
          search={{ redirect: `/m/${merchantSlug}/table/${tableToken}` }}
          className="mx-5 mt-4 block overflow-hidden rounded-3xl border border-amber-200/50 bg-gradient-to-br from-amber-50 via-orange-50/70 to-amber-100/60 transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_6px_16px_-6px_rgba(217,119,6,0.6)]">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Earn loyalty points</p>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-700/85">
                Create a free account to earn points, unlock rewards, and get exclusive offers.
              </p>
            </div>
            <UserPlus className="h-4 w-4 shrink-0 text-amber-600" />
          </div>
          <div className="flex gap-2 border-t border-amber-200/50 bg-amber-100/40 px-4 py-2">
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
      )}

      {/* Category tabs */}
      {categories.length > 2 && (
        <div className="no-scrollbar sticky top-0 z-30 mt-4 flex gap-5 overflow-x-auto border-b border-border/60 bg-background/95 px-5 pb-0 pt-2 backdrop-blur-sm">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`relative shrink-0 whitespace-nowrap pb-2.5 text-[13px] font-medium transition-colors ${
                activeCategory === cat ? "text-ink" : "text-muted-foreground hover:text-ink/70"
              }`}
            >
              {cat}
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink transition-opacity ${
                  activeCategory === cat ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      {/* Menu */}
      <div className="mt-5 pb-36">
        {items.length === 0 ? (
          <div className="mx-5 rounded-3xl border border-border/60 bg-mist/40 py-16 text-center">
            <Leaf className="mx-auto h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="mt-3 font-display text-lg text-ink">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">The menu is still being prepared</p>
          </div>
        ) : search.trim() && searchFiltered.length === 0 ? (
          <p className="px-5 text-center text-sm text-muted-foreground">
            No items match "{search}"
          </p>
        ) : (
          <div className="space-y-7 px-5">
            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <div key={cat}>
                {activeCategory === "All" && (
                  <div className="mb-3 flex items-baseline gap-2">
                    <p className="font-display text-[15px] tracking-tight text-ink">{cat}</p>
                    <span className="h-px flex-1 bg-border/70" />
                    <span className="text-[11px] text-muted-foreground">{catItems.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3.5">
                  {catItems.map((item, idx) => {
                    const qty = cart.find((c) => c.itemId === item.id)?.qty ?? 0;
                    return (
                      <TableMenuItem
                        key={item.id}
                        item={item}
                        qty={qty}
                        addedId={addedId}
                        index={idx}
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
            className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-ink to-[#182a20] px-5 py-4 text-primary-foreground shadow-[0_16px_36px_-12px_rgba(0,0,0,0.55)] transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-[9px] font-bold text-ink">
                  {cartCount}
                </span>
              </div>
              <span className="text-sm font-medium">
                {cartCount} item{cartCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {points > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-amber-200">
                  <Zap className="h-3 w-3" /> +{points} pts
                </span>
              )}
              <span className="font-display text-lg tracking-tight">NPR {total.toLocaleString()} →</span>
            </div>
          </button>
        </div>
      )}

      {/* Order placed confirmation */}
      {orderPlaced && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-[2rem] border border-border/60 bg-background p-8 text-center shadow-2xl"
            style={{ animation: "fadeScale 0.3s ease-out" }}
          >
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200/70">
              <Check className="h-7 w-7 text-emerald-600" strokeWidth={2.25} />
            </div>
            <h2 className="mt-5 font-display text-2xl tracking-tight text-ink">Order placed</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your order has been sent to the kitchen. A staff member will confirm it shortly.
            </p>
            <div className="mt-5 rounded-2xl bg-mist px-4 py-3 text-xs text-muted-foreground">
              Order #{orderPlaced.slice(0, 8)}
              {table && <> · {table.room_name ? `${table.room_name} · ` : ""}{table.name}</>}
            </div>
            <button
              onClick={() => { setOrderPlaced(null); setCheckoutOpen(false); }}
              className="mt-6 h-11 w-full rounded-full bg-ink text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Back to menu
            </button>
          </div>
        </div>
      )}

      {/* Guest checkout modal */}
      {checkoutOpen && !orderPlaced && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div
            className="w-full max-w-md rounded-t-[2rem] border border-border/60 bg-background p-6 shadow-2xl sm:rounded-[2rem]"
            style={{ animation: "sheetUp 0.32s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl tracking-tight text-ink">Checkout</h2>
              <button
                onClick={() => { setCheckoutOpen(false); setPlaceError(""); }}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Order summary */}
            <div className="mt-4 max-h-40 space-y-2.5 overflow-y-auto pr-1">
              {cart.map((c) => {
                const item = items.find((m) => m.id === c.itemId);
                return (
                  <div key={c.itemId} className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      {item?.emoji || "🍃"} {item?.name || "Item"}
                      <span className="ml-1 text-muted-foreground">×{c.qty}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      NPR {item ? (parseFloat(item.price) * c.qty).toLocaleString() : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="my-4 border-t border-dashed border-border" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Total</span>
              <span className="font-display text-2xl tracking-tight text-ink">NPR {total.toLocaleString()}</span>
            </div>
            {points > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                <Zap className="h-3 w-3" />
                {user
                  ? `You'll earn ${points} points on this order`
                  : `Sign in to earn ${points} points`}
              </p>
            )}

            {/* Guest name input — only for guests */}
            {!user && (
              <div className="mt-5">
                <label className="text-xs font-medium text-muted-foreground">Your name (optional)</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Ram"
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-amber-400/40"
                />
              </div>
            )}

            {placeError && (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {placeError}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={placing}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-medium text-primary-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)] transition-opacity hover:opacity-90 disabled:opacity-60"
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
              {user
                ? `Ordering as ${profile?.full_name || user.email}`
                : guestName.trim()
                  ? `Ordering as ${guestName.trim()}`
                  : "Ordering as guest"}
              {table ? ` · ${table.room_name ? `${table.room_name} · ` : ""}${table.name}` : ""}
            </p>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
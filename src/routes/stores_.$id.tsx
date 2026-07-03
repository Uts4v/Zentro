import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { ArrowLeft, Plus, Minus, ShoppingCart, Loader2, Star, MapPin, Phone, Zap } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { merchantApi, menuApi, type MerchantProfile, type MenuItem } from "@/lib/api";
import { useStore, cartTotal, cartPoints } from "@/lib/store";
import { useState, useEffect, useMemo } from "react";

export const Route = createFileRoute("/stores_/$id")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Store · Zentro" }] }),
  component: StoreDetail,
});

function getEmoji(businessType?: string | null): string {
  const t = businessType?.toLowerCase() || "";
  if (t.includes("bakery") || t.includes("pastry")) return "🥐";
  if (t.includes("matcha") || t.includes("tea")) return "🍵";
  if (t.includes("roaster") || t.includes("coffee")) return "🫘";
  if (t.includes("bar")) return "🍹";
  if (t.includes("food") || t.includes("restaurant")) return "🍽️";
  return "☕";
}

function StoreDetail() {
  const { id } = Route.useParams();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addedId, setAddedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const { cart, add, remove, setSelectedMerchant } = useStore();
  const nav = useNavigate();

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [profile, menuItems] = await Promise.all([
        merchantApi.get(id),
        menuApi.forMerchant(id),
      ]);
      setMerchant(profile);
      setItems(menuItems);
    } catch (e: any) {
      setError(e.message || "Failed to load store");
    } finally {
      setLoading(false);
    }
  }

  const storeMenuItems = useMemo(
    () => items.map((i) => ({
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
    [items]
  );

  const total = cartTotal(cart, storeMenuItems);
  const points = cartPoints(cart, storeMenuItems);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    return ["All", ...cats];
  }, [items]);

  const visibleItems = useMemo(() =>
    activeCategory === "All"
      ? items
      : items.filter((i) => i.category === activeCategory),
    [items, activeCategory]
  );

  const groupedItems = useMemo(() => {
    if (activeCategory !== "All") return { [activeCategory]: visibleItems };
    return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const cat = item.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [items, activeCategory, visibleItems]);

  function handleAdd(item: MenuItem) {
    setSelectedMerchant(id);
    add(item.id);
    setAddedId(item.id);
    setTimeout(() => setAddedId(null), 800);
  }

  function handleRemove(itemId: string) {
    remove(itemId);
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="flex flex-col items-center justify-center gap-3 py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading store…</p>
        </div>
      </MobileShell>
    );
  }

  if (error || !merchant) {
    return (
      <MobileShell>
        <TopBar right={
          <Link to="/stores" className="glass grid h-9 w-9 place-items-center rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        } />
        <div className="px-5 pt-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || "Store not found"}
            <button onClick={load} className="ml-2 underline">Retry</button>
          </div>
        </div>
      </MobileShell>
    );
  }

  const hasBanner = !!merchant.banner_url && !bannerError;
  const hasLogo = !!merchant.logo_url && !logoError;

  return (
    <MobileShell>
      {/* Floating back button over banner */}
      <div className="absolute left-4 top-4 z-20">
        <Link
          to="/stores"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      {/* Hero banner — taller, full bleed */}
      <div className="relative h-56 w-full overflow-hidden">
        {hasBanner ? (
          <img
            src={merchant.banner_url!}
            alt={merchant.store_name}
            className="h-full w-full object-cover"
            onError={() => setBannerError(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ember/40 via-ember-soft to-mist">
            <span className="text-8xl opacity-40">{getEmoji(merchant.business_type)}</span>
          </div>
        )}
        {/* Deep gradient for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Open/closed badge */}
        <div className="absolute right-4 top-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${
            merchant.is_open ? "bg-emerald-500/90 text-white" : "bg-black/50 text-white/80"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${merchant.is_open ? "bg-white animate-pulse" : "bg-white/40"}`} />
            {merchant.is_open ? "Open now" : "Closed"}
          </span>
        </div>
      </div>

      {/* Store identity card — overlaps banner */}
      <div className="relative z-10 -mt-16 px-4">
        <div className="glass-strong rounded-3xl p-4 shadow-soft">
          <div className="flex items-end gap-3">
            {/* Logo */}
            <div className="shrink-0">
              {hasLogo ? (
                <img
                  src={merchant.logo_url!}
                  alt={merchant.store_name}
                  className="h-16 w-16 rounded-2xl object-cover ring-4 ring-background shadow-soft"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-3xl ring-4 ring-background shadow-soft">
                  {getEmoji(merchant.business_type)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="font-display text-2xl leading-tight text-ink">{merchant.store_name}</h1>
              {merchant.business_type && (
                <p className="text-xs text-muted-foreground">{merchant.business_type}</p>
              )}
            </div>
          </div>

          {/* Description */}
          {merchant.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {merchant.description}
            </p>
          )}

          {/* Meta row */}
          {(merchant.address || merchant.phone) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {merchant.address && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ember" />
                  {merchant.address}
                </span>
              )}
              {merchant.phone && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-ember" />
                  {merchant.phone}
                </span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="mt-3 flex gap-2">
            <div className="glass flex-1 rounded-xl px-3 py-2 text-center">
              <p className="font-display text-lg text-ink">{items.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Items</p>
            </div>
            <div className="glass flex-1 rounded-xl px-3 py-2 text-center">
              <p className="font-display text-lg text-ink">
                {items.filter(i => i.loyalty_reward).length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Earn pts</p>
            </div>
            <div className="glass flex-1 rounded-xl px-3 py-2 text-center">
              <p className="font-display text-lg text-ink">
                {Object.keys(groupedItems).length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Categories</p>
            </div>
          </div>
        </div>
      </div>

      {/* Menu section */}
      <div className="mt-5 pb-36">
        <div className="px-4">
          <h2 className="font-display text-2xl text-ink">Menu</h2>
        </div>

        {/* Category tabs */}
        {categories.length > 2 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
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

        {items.length === 0 ? (
          <div className="mx-4 mt-4 glass rounded-3xl py-16 text-center">
            <p className="text-4xl">📋</p>
            <p className="mt-3 font-display text-lg text-ink">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Menu is being prepared</p>
          </div>
        ) : (
          <div className="mt-4 space-y-6 px-4">
            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <div key={cat}>
                {activeCategory === "All" && (
                  <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {cat}
                  </p>
                )}
                <div className="space-y-3">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      qty={cart.find((c) => c.itemId === item.id)?.qty ?? 0}
                      justAdded={addedId === item.id}
                      onAdd={() => handleAdd(item)}
                      onRemove={() => handleRemove(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-[440px] px-4">
          <button
            onClick={() => nav({ to: "/cart" })}
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
    </MobileShell>
  );
}

// ── Menu item card ────────────────────────────────────────────────────────────
function MenuItemCard({
  item, qty, justAdded, onAdd, onRemove,
}: {
  item: MenuItem;
  qty: number;
  justAdded: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.image_url && !imgError;
  const price = parseFloat(item.price);

  return (
    <div className={`glass-strong overflow-hidden rounded-2xl transition-all ${
      qty > 0 ? "ring-1 ring-ink/10" : ""
    }`}>
      <div className="flex items-stretch gap-0">
        {/* Image or emoji */}
        <div className="relative shrink-0">
          {hasImage ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="h-24 w-24 object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="grid h-24 w-24 place-items-center bg-mist text-3xl">
              {item.emoji || "🍽️"}
            </div>
          )}
          {qty > 0 && (
            <div className="absolute inset-0 bg-ink/10" />
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold leading-tight text-ink">{item.name}</p>
              {item.is_featured && (
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </div>
            {item.description && (
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div>
              <span className="font-display text-base text-ink">
                NPR {price.toLocaleString()}
              </span>
              {item.points_per_item > 0 && (
                <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-ember-soft px-1.5 py-0.5 text-[10px] font-medium text-ember">
                  <Zap className="h-2.5 w-2.5" /> {item.points_per_item}
                </span>
              )}
            </div>

            {/* Add/remove controls */}
            {qty === 0 ? (
              <button
                onClick={onAdd}
                className={`grid h-8 w-8 place-items-center rounded-full transition-all ${
                  justAdded
                    ? "bg-emerald-500 text-white scale-110"
                    : "bg-ink text-primary-foreground active:scale-95"
                }`}
              >
                {justAdded ? <span className="text-xs">✓</span> : <Plus className="h-4 w-4" />}
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
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
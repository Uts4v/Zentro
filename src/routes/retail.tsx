// routes/ retails.tsx 
import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { requireAuth } from "@/lib/auth-guard";
import {
  Plus, Minus, X, ShoppingBag, Loader2, Star,
  Package, Truck, Phone, MapPin, Zap, Search,
} from "lucide-react";
import { retailApi, merchantApi, type RetailProduct, type MerchantProfile } from "@/lib/api";
import { useState, useEffect, useMemo } from "react";

export const Route = createFileRoute("/retail")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Retail · Zentro" }] }),
  component: RetailShop,
});

interface CartItem {
  product: RetailProduct;
  qty: number;
}

function RetailShop() {
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Shipping form
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [shippingStep, setShippingStep] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const merchants = await merchantApi.list();
        const open = merchants.filter((m) => m.is_open);
        if (open.length > 0) {
          setMerchant(open[0]);
          const data = await retailApi.forMerchant(open[0].id);
          setProducts(data);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function addToCart(product: RetailProduct) {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === product.id);
      if (ex) return prev.map((c) => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === productId);
      if (!ex) return prev;
      if (ex.qty === 1) return prev.filter((c) => c.product.id !== productId);
      return prev.map((c) => c.product.id === productId ? { ...c, qty: c.qty - 1 } : c);
    });
  }

  const totalAmount = useMemo(
    () => cart.reduce((s, c) => s + Number(c.product.price) * c.qty, 0),
    [cart]
  );

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const categoryOrder = useMemo(() => {
    const seen: string[] = [];
    searchFiltered.forEach((p) => {
      const cat = p.category?.trim() || "Other";
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
  }, [searchFiltered]);

  const categories = ["All", ...categoryOrder];

  const groupedProducts = useMemo(() => {
    const groups: Record<string, RetailProduct[]> = {};
    searchFiltered.forEach((p) => {
      const cat = p.category?.trim() || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  }, [searchFiltered]);

  const visibleCategories = filterCat === "All"
    ? categoryOrder
    : categoryOrder.filter((c) => c === filterCat);

  async function placeOrder() {
    if (!merchant || cart.length === 0) return;
    if (!shippingName.trim() || !shippingPhone.trim() || !shippingAddress.trim()) return;
    setPlacing(true);
    setError("");
    try {
      const order = await retailApi.createOrder({
        merchant_id: merchant.id,
        items: cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.qty,
          name: c.product.name,
          price: parseFloat(c.product.price),
        })),
        notes,
        shipping_name: shippingName,
        shipping_phone: shippingPhone,
        shipping_address: shippingAddress,
      });
      setSuccess(order.id);
      setCart([]);
      setCartOpen(false);
      setShippingStep(false);
      setShippingName("");
      setShippingPhone("");
      setShippingAddress("");
      setNotes("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  }

  // Success screen
  if (success) {
    return (
      <MobileShell>
        <TopBar />
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
          <div className="glass-strong rounded-3xl p-10">
            <p className="text-6xl">📦</p>
            <h2 className="font-display mt-4 text-3xl text-ink">Order placed!</h2>
            <p className="mt-2 text-muted-foreground">
              Your retail order <span className="font-medium text-ink">#{success.slice(0, 8)}</span> has been received.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll get in touch to confirm shipping.
            </p>
            <button
              onClick={() => setSuccess(null)}
              className="gradient-ember mt-8 h-11 w-full rounded-2xl text-sm font-medium text-white"
            >
              Shop more
            </button>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <TopBar />

      {/* Hero */}
      <section className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-[28px] p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400 opacity-20 blur-3xl" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Premium teas
          </p>
          <h1 className="font-display mt-2 text-[40px] leading-[1] text-ink">
            Retail Shop
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Packaged teas to enjoy at home. Free pickup or delivery available.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
              <Package className="h-3 w-3 text-emerald-600" /> Premium packaging
            </span>
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
              <Truck className="h-3 w-3 text-sky-600" /> Delivery available
            </span>
          </div>
        </div>
      </section>

      {/* Search bar */}
      <section className="mt-4 px-5">
        <div className="glass-strong flex items-center gap-2 rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search retail products…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground/70"
          />
          {search && (
            <button onClick={() => setSearch("")} className="shrink-0 text-muted-foreground hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                filterCat === c
                  ? "bg-ink text-primary-foreground shadow-soft"
                  : "glass text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Products */}
      <section className="mt-3 px-5 pb-32">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : products.length === 0 ? (
          <div className="glass rounded-3xl py-16 text-center">
            <p className="text-4xl">🫖</p>
            <p className="mt-3 text-sm text-muted-foreground">No retail products available yet</p>
          </div>
        ) : searchFiltered.length === 0 ? (
          <div className="glass rounded-3xl py-16 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-3 text-sm text-muted-foreground">No products match your search</p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleCategories.map((cat) => (
              <section key={cat} id={`retail-cat-${cat}`} className="scroll-mt-24">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="font-display text-2xl text-ink">{cat}</h2>
                  <span className="text-xs text-muted-foreground">
                    {groupedProducts[cat]?.length ?? 0} products
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(groupedProducts[cat] ?? []).map((product) => {
                    const inCart = cart.find((c) => c.product.id === product.id);
                    return (
                      <RetailProductCard
                        key={product.id}
                        product={product}
                        qty={inCart?.qty ?? 0}
                        onAdd={() => addToCart(product)}
                        onRemove={() => removeFromCart(product.id)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* Floating cart bar */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <button
            onClick={() => { setCartOpen(true); setShippingStep(false); }}
            className="gradient-ember flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-medium text-white shadow-lg"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-xs font-bold">
                {cartCount}
              </span>
              View cart
            </span>
            <span className="font-display text-base">NPR {totalAmount.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Cart / checkout drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}
        >
          <div className="glass-strong w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">
                {shippingStep ? "Shipping details" : "Your cart"}
              </h2>
              <button
                onClick={() => { setCartOpen(false); setShippingStep(false); }}
                className="grid h-8 w-8 place-items-center rounded-full bg-mist text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!shippingStep ? (
              <>
                {/* Cart items */}
                <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
                  {cart.map(({ product, qty }) => (
                    <div key={product.id} className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-mist text-xl">
                            {product.emoji}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          NPR {Number(product.price).toLocaleString()} each
                          {product.weight_grams && ` · ${product.weight_grams}g`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-mist text-ink"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium text-ink">{qty}</span>
                        <button
                          onClick={() => addToCart(product)}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-mist text-ink"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setCart((prev) => prev.filter((c) => c.product.id !== product.id))}
                          className="ml-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-rose-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm text-ink">
                        NPR {(Number(product.price) * qty).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="mt-4 rounded-2xl bg-mist p-4">
                  <div className="flex justify-between font-medium">
                    <span className="text-ink">Total</span>
                    <span className="font-display text-lg text-ink">NPR {totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setShippingStep(true)}
                  disabled={cart.length === 0}
                  className="gradient-ember mt-4 h-12 w-full rounded-2xl text-sm font-medium text-white disabled:opacity-50"
                >
                  Continue to shipping →
                </button>
              </>
            ) : (
              <>
                {/* Shipping form */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                      Full name *
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-white/50 px-3">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={shippingName}
                        onChange={(e) => setShippingName(e.target.value)}
                        placeholder="Your name"
                        className="h-11 flex-1 bg-transparent text-sm text-ink outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                      Phone *
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-white/50 px-3">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={shippingPhone}
                        onChange={(e) => setShippingPhone(e.target.value)}
                        placeholder="+977 98XXXXXXXX"
                        className="h-11 flex-1 bg-transparent text-sm text-ink outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                      Delivery address *
                    </label>
                    <textarea
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Street, area, city…"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-border bg-white/50 px-3 py-2.5 text-sm text-ink outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                      Notes (optional)
                    </label>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any special instructions…"
                      className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink outline-none"
                    />
                  </div>
                </div>

                {/* Order summary */}
                <div className="mt-4 rounded-2xl bg-mist p-3 text-xs">
                  {cart.map((c) => (
                    <div key={c.product.id} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">{c.qty}× {c.product.name}</span>
                      <span className="text-ink">NPR {(Number(c.product.price) * c.qty).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
                    <span className="text-ink">Total</span>
                    <span className="font-display text-sm text-ink">NPR {totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {error && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setShippingStep(false)}
                    className="h-12 flex-1 rounded-2xl border border-border text-sm text-muted-foreground"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={placeOrder}
                    disabled={placing || !shippingName.trim() || !shippingPhone.trim() || !shippingAddress.trim()}
                    className="gradient-ember flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium text-white disabled:opacity-50"
                  >
                    {placing && <Loader2 className="h-4 w-4 animate-spin" />}
                    Place order · NPR {totalAmount.toLocaleString()}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </MobileShell>
  );
}

// ── Retail product card ───────────────────────────────────────────────────────

function RetailProductCard({
  product, qty, onAdd, onRemove,
}: {
  product: RetailProduct;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!product.image_url && !imgError;

  return (
    <article className="glass-strong overflow-hidden rounded-3xl">
      {hasImage ? (
        <img
          src={product.image_url}
          alt={product.name}
          className="h-36 w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="flex h-28 items-center justify-center bg-mist text-5xl">
          {product.emoji}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {hasImage && <span className="text-base">{product.emoji}</span>}
              <h3 className="font-display truncate text-base leading-tight text-ink">{product.name}</h3>
              {product.is_featured && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
            </div>
            {product.weight_grams && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{product.weight_grams}g</p>
            )}
          </div>
          <p className="font-display shrink-0 text-base text-ink">
            NPR {Number(product.price).toLocaleString()}
          </p>
        </div>

        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{product.description}</p>
        )}

        {/* Stock badge */}
        {product.stock !== -1 && product.stock <= 5 && (
          <p className={`mt-1.5 text-[10px] font-medium ${product.stock === 0 ? "text-rose-500" : "text-amber-600"}`}>
            {product.stock === 0 ? "Out of stock" : `Only ${product.stock} left`}
          </p>
        )}

        <div className="mt-3">
          {product.stock === 0 ? (
            <div className="h-9 w-full rounded-xl bg-mist text-center text-xs leading-9 text-muted-foreground">
              Out of stock
            </div>
          ) : qty === 0 ? (
            <button
              onClick={onAdd}
              className="gradient-ember h-9 w-full rounded-xl text-xs font-medium text-white active:scale-[0.98] transition-transform"
            >
              Add to cart
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-mist px-2 py-1">
              <button
                onClick={onRemove}
                className="grid h-7 w-7 place-items-center rounded-lg bg-white text-ink shadow-sm"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="font-display text-base text-ink">{qty}</span>
              <button
                onClick={onAdd}
                className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-primary-foreground shadow-sm"
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
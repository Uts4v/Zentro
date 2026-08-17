// routes/pos.orders.retail.tsx — Retail store counter sale (POS)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { retailApi, type RetailProduct } from "@/lib/api";
import { posApi } from "@/lib/pos-api";
import {
  Loader2,
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Banknote,
  Smartphone,
  CheckCircle2,
  Tag,
} from "lucide-react";

export const Route = createFileRoute("/pos/orders/retail")({
  head: () => ({ meta: [{ title: "Retail Sale · Zentro POS" }] }),
  component: RetailSalePage,
});

interface RetailCartItem {
  product: RetailProduct;
  quantity: number;
}

function RetailSalePage() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const merchant = merchantProfile;

  const [step, setStep] = useState<1 | 2>(1);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<RetailCartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");

  // Payment step
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "fonepay">("cash");
  const [customerName, setCustomerName] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);

  useEffect(() => {
    if (!merchant) return;
    (async () => {
      try {
        const data = await retailApi.forMerchant(merchant.id);
        setProducts(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load retail products");
      } finally {
        setLoading(false);
      }
    })();
  }, [merchant]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category?.trim()).filter(Boolean));
    return ["All", ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (category !== "All") {
      result = result.filter((p) => (p.category?.trim() || "Other") === category);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [products, category, search]);

  const cartTotal = useMemo(
    () => cart.reduce((s, c) => s + Number(c.product.price) * c.quantity, 0),
    [cart],
  );

  const discountAmount = useMemo(() => {
    if (!discountValue) return 0;
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return 0;
    if (discountType === "amount") {
      return Math.min(val, cartTotal);
    }
    return Math.round(cartTotal * Math.min(val, 100) / 100);
  }, [cartTotal, discountType, discountValue]);

  const orderTotal = cartTotal - discountAmount;

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  function addToCart(product: RetailProduct) {
    if (product.stock > 0) {
      const inCart = cart.find((c) => c.product.id === product.id);
      if (inCart && inCart.quantity >= product.stock) return;
    }
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === product.id);
      if (ex) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === productId);
      if (!ex) return prev;
      if (ex.quantity <= 1) {
        return prev.filter((c) => c.product.id !== productId);
      }
      return prev.map((c) => (c.product.id === productId ? { ...c, quantity: c.quantity - 1 } : c));
    });
  }

  function incrementCart(productId: string) {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === productId
          ? {
              ...c,
              quantity:
                c.product.stock > 0 ? Math.min(c.quantity + 1, c.product.stock) : c.quantity + 1,
            }
          : c,
      ),
    );
  }

  const received = parseFloat(cashReceived) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - orderTotal) : 0;

  function scrollToCart() {
    document.getElementById("retail-cart")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleCompleteSale() {
    if (!merchant) return;
    if (cart.length === 0) {
      setError("Add at least one product to the cart");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const order = await posApi.createRetailStoreOrder({
        merchant_id: merchant.id,
        items: cart.map((c) => ({
          product_id: c.product.id,
          name: c.product.name,
          price: Number(c.product.price),
          quantity: c.quantity,
        })),
        customer_name: customerName || undefined,
        payment_method: paymentMethod,
        cash_received: paymentMethod === "cash" ? received : undefined,
        change: change > 0 ? change : undefined,
        notes: saleNotes || undefined,
        discount_type: discountAmount > 0 ? discountType : null,
        discount_value: discountAmount > 0 ? parseFloat(discountValue) || null : null,
      });

      navigate({
        to: "/pos/retail-bill/$orderId",
        params: { orderId: order.id },
        search: {
          method: paymentMethod,
          received: paymentMethod === "cash" ? received : 0,
          change: change,
        },
        replace: true,
      } as any);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to complete sale");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <button
        onClick={() => (step === 2 ? setStep(1) : navigate({ to: "/pos" } as any))}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {step === 2 ? "Back to products" : "Back to orders"}
      </button>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* Products */}
          <div className="space-y-3">
            <div>
              <h2 className="font-display text-2xl text-ink">Retail Sale</h2>
              <p className="text-sm text-muted-foreground">Tap products to add them to the cart</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search retail products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-xl bg-mist pl-10 pr-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    category === cat
                      ? "bg-ink text-primary-foreground"
                      : "text-muted-foreground hover:bg-mist"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const inCart = cart.find((c) => c.product.id === product.id);
                const out = product.stock === 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={out}
                    className={`glass flex items-center gap-3 rounded-xl p-3 text-left transition-all hover:ring-2 hover:ring-ember/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                      inCart ? "ring-2 ring-ember/40" : ""
                    }`}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-mist text-2xl">
                      {product.emoji || "🛍️"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        NPR {Number(product.price).toLocaleString()}
                      </p>
                      {product.stock > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {inCart ? `${inCart.quantity} in cart · ` : ""}
                          {product.stock} in stock
                        </p>
                      )}
                      {out && <p className="text-[11px] font-medium text-rose-600">Out of stock</p>}
                    </div>
                    {inCart && (
                      <span className="rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-white">
                        ×{inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cart — always visible, sticky on desktop */}
          <div
            id="retail-cart"
            className="glass rounded-2xl p-4 scroll-mt-16 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShoppingBag className="h-4 w-4 text-ember" />
                Cart
                {cartCount > 0 && (
                  <span className="rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-muted-foreground hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No products yet</p>
            ) : (
              <>
                <div className="mt-3 space-y-3">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          NPR {Number(item.product.price).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-mist text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          {item.quantity === 1 ? (
                            <Trash2 className="h-4 w-4" />
                          ) : (
                            <Minus className="h-4 w-4" />
                          )}
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-ink">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => incrementCart(item.product.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-mist text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="text-sm font-medium text-ink">
                      NPR {cartTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Discount */}
                  {!showDiscount && discountAmount === 0 && (
                    <button
                      onClick={() => setShowDiscount(true)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      Add discount
                    </button>
                  )}
                  {showDiscount && (
                    <div className="space-y-2 rounded-lg bg-mist p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Discount
                        </span>
                        <button
                          onClick={() => {
                            setShowDiscount(false);
                            setDiscountValue("");
                          }}
                          className="text-[10px] text-muted-foreground hover:text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setDiscountType("amount")}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${
                            discountType === "amount"
                              ? "bg-ink text-primary-foreground"
                              : "text-muted-foreground hover:bg-white"
                          }`}
                        >
                          NPR
                        </button>
                        <button
                          onClick={() => setDiscountType("percent")}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${
                            discountType === "percent"
                              ? "bg-ink text-primary-foreground"
                              : "text-muted-foreground hover:bg-white"
                          }`}
                        >
                          %
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={discountType === "percent" ? 100 : cartTotal}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === "amount" ? "0" : "0%"}
                        className="h-8 w-full rounded-lg bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40"
                      />
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-emerald-600">
                        Discount{discountType === "percent" ? ` (${discountValue}%)` : ""}
                      </span>
                      <span className="text-sm font-medium text-emerald-600">
                        -NPR {discountAmount.toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-border pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">Total</span>
                      <span className="text-lg font-semibold text-ink">
                        NPR {orderTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className="mt-3 grid h-12 w-full place-items-center rounded-xl bg-ink text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Review & Pay →
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Step 2: Review + payment */
        <div className="mx-auto max-w-md space-y-4">
          <div className="glass rounded-2xl p-5">
            <h2 className="flex items-center gap-2 font-display text-2xl text-ink">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Review & Pay
            </h2>

            <div className="mt-4 space-y-2 border-b border-border pb-4">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {item.product.name}{" "}
                    <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="font-medium text-ink">
                    NPR {(Number(item.product.price) * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-ink">NPR {cartTotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-600">
                    Discount{discountType === "percent" ? ` (${discountValue}%)` : ""}
                  </span>
                  <span className="font-medium text-emerald-600">
                    -NPR {discountAmount.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border text-base">
                <span className="font-medium text-ink">Total</span>
                <span className="font-semibold text-ink">NPR {orderTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Payment method
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-sm font-medium transition-colors ${
                    paymentMethod === "cash"
                      ? "bg-ink text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-mist"
                  }`}
                >
                  <Banknote className="h-5 w-5" />
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod("fonepay")}
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-sm font-medium transition-colors ${
                    paymentMethod === "fonepay"
                      ? "bg-ink text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-mist"
                  }`}
                >
                  <Smartphone className="h-5 w-5" />
                  Fonepay
                </button>
              </div>
            </div>

            {/* Customer name */}
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Customer name (optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in customer"
                className="mt-2 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            {/* Cash received */}
            {paymentMethod === "cash" && (
              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Cash received
                </label>
                <input
                  type="number"
                  min="0"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0"
                  className="mt-2 h-12 w-full rounded-xl bg-mist px-4 text-base font-semibold text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
                />
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[
                    { label: "Exact", value: orderTotal },
                    { label: "500", value: 500 },
                    { label: "1000", value: 1000 },
                    { label: "2000", value: 2000 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setCashReceived(String(opt.value))}
                      className="rounded-lg border border-border px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist hover:text-ink"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {received > 0 && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">Change</span>
                    <span className="font-semibold text-emerald-600">
                      NPR {change.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mt-4">
              <textarea
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Sale notes (optional)"
                rows={2}
                className="w-full rounded-xl bg-mist px-4 py-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={submitting || cart.length === 0}
              className="mt-4 grid h-14 w-full place-items-center rounded-xl bg-emerald-600 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Complete Sale · NPR ${orderTotal.toLocaleString()}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Floating cart bar on small screens */}
      {step === 1 && cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
          <button
            onClick={scrollToCart}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-ink px-4 text-primary-foreground"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShoppingBag className="h-4 w-4" />
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </span>
            <span className="text-sm font-semibold">
              NPR {orderTotal.toLocaleString()} · Review →
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

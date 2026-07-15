// routes/pos.orders.new.tsx — Create walk-in order (full page)
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { menuApi, type MenuItem, type MerchantTable, tableApi } from "@/lib/api";
import { posApi } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Search, Plus, Minus, Trash2, Tag } from "lucide-react";

export const Route = createFileRoute("/pos/orders/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    type: (search.type as "walk_in" | "dine_in") || "walk_in",
  }),
  head: () => ({ meta: [{ title: "New Order · Zentro POS" }] }),
  component: NewOrderPage,
});

interface CartItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  points_per_item: number;
  emoji?: string;
}

function NewOrderPage() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const { type: initialType } = useSearch({ from: "/pos/orders/new" });
  const merchant = merchantProfile;

  const [step, setStep] = useState<1 | 2>(1);
  const [orderType, setOrderType] = useState<"dine_in" | "pickup">(initialType === "dine_in" ? "dine_in" : "pickup");
  const [tableId, setTableId] = useState<string>("");
  const [walkInName, setWalkInName] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<MerchantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);

  // Fetch menu items and tables
  useEffect(() => {
    if (!merchant) return;
    (async () => {
      try {
        const [items, tbls] = await Promise.all([
          menuApi.forMerchant(merchant.id),
          tableApi.list().catch(() => []),
        ]);
        setMenuItems(items.filter((i) => i.is_available));
        setTables(tbls.filter((t) => t.is_active));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [merchant]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((i) => i.category).filter(Boolean));
    return ["All", ...Array.from(cats)];
  }, [menuItems]);

  // Filtered menu
  const filteredMenu = useMemo(() => {
    let result = menuItems;
    if (category !== "All") {
      result = result.filter((i) => i.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [menuItems, category, search]);

  // Cart helpers
  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart]
  );

  const discountAmount = useMemo(() => {
    if (!discountValue) return 0;
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return 0;
    if (discountType === "amount") {
      return Math.min(val, cartTotal);
    }
    return Math.round(cartTotal * Math.min(val, 100) / 100);
  }, [cartTotal, discountType, discountValue]);

  const orderTotal = cartTotal - discountAmount;

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: 1,
          points_per_item: item.points_per_item,
          emoji: item.emoji,
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((menuItemId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === menuItemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((c) => c.menu_item_id !== menuItemId);
      }
      return prev.map((c) =>
        c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity - 1 } : c
      );
    });
  }, []);

  const incrementCartItem = useCallback((menuItemId: string) => {
    setCart((prev) =>
      prev.map((c) =>
        c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + 1 } : c
      )
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // Place order
  async function handlePlaceOrder() {
    if (!merchant) return;
    if (cart.length === 0) {
      setError("Add at least one item to the cart");
      return;
    }
    if (orderType === "dine_in" && !tableId) {
      setError("Select a table for dine-in orders");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const order = await posApi.createWalkInOrder({
        merchant_id: merchant.id,
        table_id: tableId || null,
        items: cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          name: c.name,
          price: c.price,
          points_per_item: c.points_per_item,
        })),
        notes: notes || undefined,
        order_type: orderType,
        walk_in_name: walkInName || undefined,
        discount_type: discountAmount > 0 ? discountType : null,
        discount_value: discountAmount > 0 ? parseFloat(discountValue) || null : null,
      });

      const tableName =
        orderType === "dine_in"
          ? tables.find((t) => t.id === tableId)?.name ?? "Table"
          : "Pickup";

      navigate({
        to: "/pos" as any,
        replace: true,
      });
    } catch (err: any) {
      setError(err.message || "Failed to place order");
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
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Back button */}
      <button
        onClick={() => (step === 2 ? setStep(1) : navigate({ to: "/pos" as any }))}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {step === 2 ? "Back to order type" : "Back to orders"}
      </button>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Order type + table */}
      {step === 1 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="font-display text-2xl text-ink">New Order</h2>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Order type
              </label>
              <div className="mt-2 flex gap-2">
                {(["dine_in", "pickup"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                      orderType === t
                        ? "bg-ink text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-mist"
                    }`}
                  >
                    {t === "dine_in" ? "🍽️ Dine-in" : "🥡 Pickup"}
                  </button>
                ))}
              </div>
            </div>

            {orderType === "dine_in" && (
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Table
                </label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-border bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                >
                  <option value="">Select table...</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Walk-in customer name (optional)
              </label>
              <input
                type="text"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Anonymous"
                className="mt-2 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            <button
              onClick={() => setStep(2)}
              className="mt-4 grid h-12 w-full place-items-center rounded-xl bg-ink text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Continue to Menu →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Menu + Cart */}
      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Menu */}
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search menu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl bg-mist pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-ink text-primary-foreground"
                      : "text-muted-foreground hover:bg-mist"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu grid */}
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredMenu.map((item) => {
                const inCart = cart.find((c) => c.menu_item_id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`glass flex items-center gap-3 rounded-xl p-3 text-left transition-all hover:ring-2 hover:ring-ember/20 ${
                      inCart ? "ring-2 ring-ember/40" : ""
                    }`}
                  >
                    <span className="text-2xl">{item.emoji || "🍵"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        NPR {Number(item.price).toLocaleString()}
                      </p>
                    </div>
                    {inCart && (
                      <span className="rounded-full bg-ember px-2 py-0.5 text-[10px] font-bold text-white">
                        ×{inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cart */}
          <div className="glass rounded-2xl p-4 lg:sticky lg:top-20 lg:h-fit">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink">Cart</h3>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-muted-foreground hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Tap items to add
              </p>
            ) : (
              <>
                <div className="mt-3 space-y-2">
                  {cart.map((item) => (
                    <div
                      key={item.menu_item_id}
                      className="flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          NPR {item.price.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => removeFromCart(item.menu_item_id)}
                          className="grid h-6 w-6 place-items-center rounded-md bg-mist text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          {item.quantity === 1 ? (
                            <Trash2 className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </button>
                        <span className="w-5 text-center text-xs font-medium text-ink">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => incrementCartItem(item.menu_item_id)}
                          className="grid h-6 w-6 place-items-center rounded-md bg-mist text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium text-ink">
                      NPR {cartTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Discount */}
                  {!showDiscount && discountAmount === 0 && (
                    <button
                      onClick={() => setShowDiscount(true)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-ink"
                    >
                      <Tag className="h-3 w-3" />
                      Add discount
                    </button>
                  )}
                  {showDiscount && (
                    <div className="mt-2 space-y-2 rounded-lg bg-mist p-2">
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
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className="text-emerald-600">
                        Discount{discountType === "percent" ? ` (${discountValue}%)` : ""}
                      </span>
                      <span className="font-medium text-emerald-600">
                        -NPR {discountAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="mt-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Order notes..."
                    rows={2}
                    className="w-full rounded-lg bg-mist px-3 py-2 text-xs text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
                  />
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={submitting || cart.length === 0}
                  className="mt-3 grid h-11 w-full place-items-center rounded-xl bg-ink text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Place Order · NPR ${orderTotal.toLocaleString()}`
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

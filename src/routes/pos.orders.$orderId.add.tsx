// routes/pos.orders.$orderId.add.tsx — Add items to an existing order
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { menuApi, type MenuItem } from "@/lib/api";
import { posApi } from "@/lib/pos-api";
import { supabase } from "@/lib/supabase";
import { Loader2, ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/pos/orders/$orderId/add")({
  head: () => ({ meta: [{ title: "Add Items · Zentro POS" }] }),
  component: AddItemsPage,
});

interface CartItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  points_per_item: number;
  emoji?: string;
}

interface ExistingItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface ExistingOrder {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  items: ExistingItem[];
  table_name: string | null;
  room_name: string | null;
  order_type: string;
  walk_in_name: string | null;
}

function AddItemsPage() {
  const { orderId } = Route.useParams();
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const merchant = merchantProfile;

  const [order, setOrder] = useState<ExistingOrder | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");

  // Fetch existing order + menu
  useEffect(() => {
    if (!merchant) return;
    (async () => {
      try {
        const [orderData, items] = await Promise.all([
          (async () => {
            const { data, error } = await supabase
              .from("orders")
              .select("id, status, payment_status, total_amount, order_type, walk_in_name, table_name_snapshot, room_name_snapshot, order_items(name, quantity, price, subtotal)")
              .eq("id", orderId)
              .single();
            if (error) throw new Error(error.message);
            return {
              id: data.id,
              status: data.status,
              payment_status: data.payment_status,
              total_amount: Number(data.total_amount),
              items: (data.order_items ?? []).map((i: any) => ({
                name: i.name,
                quantity: i.quantity,
                price: Number(i.price),
                subtotal: Number(i.subtotal),
              })),
              table_name: data.table_name_snapshot,
              room_name: data.room_name_snapshot,
              order_type: data.order_type,
              walk_in_name: data.walk_in_name,
            } as ExistingOrder;
          })(),
          menuApi.forMerchant(merchant.id),
        ]);
        setOrder(orderData);
        setMenuItems(items.filter((i) => i.is_available));
      } catch {
        setError("Order not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [merchant, orderId]);

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

  // Submit additional items
  async function handleAddItems() {
    if (cart.length === 0) {
      setError("Add at least one item");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await posApi.addItemsToOrder(
        orderId,
        cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          name: c.name,
          price: c.price,
          quantity: c.quantity,
          points_per_item: c.points_per_item,
        }))
      );

      navigate({ to: "/pos" as any, replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to add items");
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

  if (!order) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <button
          onClick={() => navigate({ to: "/pos" as any })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </button>
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error || "Order not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Back button */}
      <button
        onClick={() => navigate({ to: "/pos" as any })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to orders
      </button>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Existing order info */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-ink">Add Items to Order</h2>
            <p className="text-xs text-muted-foreground">
              {order.order_type === "dine_in" ? (
                <>{order.room_name ? `${order.room_name} · ` : ""}{order.table_name || "Table"}</>
              ) : "Pickup"}
              {order.walk_in_name ? ` · ${order.walk_in_name}` : ""}
              {" · "}
              <span className={`font-medium ${order.status === "cancelled" ? "text-rose-500" : "text-muted-foreground"}`}>
                {order.status.toUpperCase()}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current Total</p>
            <p className="text-sm font-bold text-ink">NPR {order.total_amount.toLocaleString()}</p>
          </div>
        </div>

        {/* Existing items */}
        {order.items.length > 0 && (
          <div className="mt-3 rounded-xl bg-background/60 px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Current Items</p>
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                <span className="text-ink">
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-1 text-muted-foreground">×{item.quantity}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  NPR {Number(item.subtotal).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu + Cart */}
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
            <h3 className="text-sm font-medium text-ink">New Items</h3>
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

              {/* Totals */}
              <div className="mt-3 border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Adding</span>
                  <span className="font-medium text-ink">
                    NPR {cartTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current total</span>
                  <span className="text-muted-foreground">
                    NPR {order.total_amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-ink">New total</span>
                  <span className="text-ink">
                    NPR {(order.total_amount + cartTotal).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={handleAddItems}
                disabled={submitting || cart.length === 0}
                className="mt-3 grid h-11 w-full place-items-center rounded-xl bg-ink text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Add to Order · NPR {cartTotal.toLocaleString()}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useStore, cartTotal, cartPoints, type MenuItem } from "@/lib/store";
import { TopBar, MobileShell } from "@/components/MobileShell";
import { Minus, Plus, ArrowLeft, Loader2, AlertCircle, UtensilsCrossed, ShoppingBag } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { menuApi } from "@/lib/api";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/cart")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Your bag · Zentro" }] }),
  component: Cart,
});

function Cart() {
  const { cart, add, remove, placeOrder, selectedMerchantId, clearCart, tableContext } = useStore();
  const nav = useNavigate();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMenu();
  }, [selectedMerchantId]);

  async function loadMenu() {
    if (!selectedMerchantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await menuApi.forMerchant(selectedMerchantId);
      setMenuItems(
        items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: parseFloat(i.price),
          category: i.category,
          emoji: i.emoji,
          points_per_item: i.points_per_item,
          is_available: i.is_available,
          image_url: i.image_url,
        }))
      );
    } catch {
      // If API fails, cart calculations will just skip unknown items
    } finally {
      setLoading(false);
    }
  }

  const total = cartTotal(cart, menuItems);
  const points = cartPoints(cart, menuItems);

  async function handlePlaceOrder() {
    if (placing) return;
    setPlacing(true);
    setError("");
    try {
      const id = await placeOrder(menuItems);
      nav({ to: "/orders/$id", params: { id } });
    } catch (e: any) {
      setError(e.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <MobileShell>
      <TopBar
        right={
          <Link to="/" className="glass grid h-9 w-9 place-items-center rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />
      <div className="px-5">
        <h1 className="font-display text-4xl text-ink">Your bag</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cart.length === 0
            ? "Quiet for now. Add something lovely."
            : `${cart.reduce((s, c) => s + c.qty, 0)} item${cart.reduce((s, c) => s + c.qty, 0) !== 1 ? "s" : ""} ready to brew.`}
        </p>
      </div>

      <div className="mt-6 space-y-3 px-5">
        {cart.map((c) => {
          const item = menuItems.find((m) => m.id === c.itemId);
          return (
            <div key={c.itemId} className="glass flex items-center gap-3 rounded-2xl p-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-mist text-2xl">
                {item?.emoji || "🍽️"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{item?.name || "Unknown item"}</p>
                <p className="font-display text-lg text-ink">
                  NPR {item ? (item.price * c.qty).toLocaleString() : "—"}
                </p>
              </div>
              <div className="glass flex shrink-0 items-center gap-1 rounded-full p-1">
                <button
                  onClick={() => remove(c.itemId)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm font-medium">{c.qty}</span>
                <button
                  onClick={() => add(c.itemId)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-ink text-primary-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div className="mt-8 px-5">
          <div className="glass-strong rounded-3xl p-5">
            {/* Table context banner */}
            {tableContext && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                <UtensilsCrossed className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-amber-800">Dine-in order</p>
                  <p className="text-sm font-semibold text-amber-900">{tableContext.tableName}</p>
                </div>
              </div>
            )}

            <Row label="Subtotal" value={`NPR ${total.toLocaleString()}`} />
            <Row label="Service" value="—" />
            <div className="my-3 border-t border-border" />
            <Row label="Total" value={`NPR ${total.toLocaleString()}`} bold />
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-ember-soft px-4 py-3">
              <span className="text-xs text-ink">You'll earn</span>
              <span className="font-display text-lg text-ember">+{points} pts</span>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={placing}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-base font-medium text-primary-foreground shadow-ember transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {placing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
                </>
              ) : (
                `Place order · NPR ${total.toLocaleString()}`
              )}
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${bold ? "font-medium text-ink" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "font-display text-2xl text-ink" : "text-sm text-ink"}`}>{value}</span>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { Check, RefreshCw, Loader2, Clock, Bell, X } from "lucide-react";
import { orderApi, type Order, type OrderStatus } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/merchant/orders")({
  head: () => ({ meta: [{ title: "Orders · Merchant · Zentro" }] }),
  component: MerchantOrders,
});

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

const ADVANCE_LABEL: Record<OrderStatus, string> = {
  pending: "Confirm order",
  confirmed: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark picked up",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-sky-100 text-sky-700",
  preparing: "bg-violet-100 text-violet-700",
  ready: "bg-emerald-100 text-emerald-700",
  completed: "bg-mist text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-500",
};

// Orders in these statuses can still be cancelled by the merchant.
// Once an order is "ready" it's already made and about to be picked up,
// so cancelling from there is disabled — adjust if you want otherwise.
const CANCELLABLE: OrderStatus[] = ["pending", "confirmed", "preparing"];

function MerchantOrders() {
  if (typeof window === "undefined") return null;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const knownOrderIds = useRef<Set<string>>(new Set());

  // Play a subtle notification sound for new orders
  function playNotification() {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio not available — ignore
    }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const data = await orderApi.storeOrders();
      setOrders(data);
      // Initialise known IDs on first load
      if (knownOrderIds.current.size === 0) {
        data.forEach((o) => knownOrderIds.current.add(o.id));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Subscribe to ALL changes on orders table for this merchant
    const channel = supabase
      .channel("merchant-orders-realtime", {
        config: { presence: { key: "merchant" } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          // New order — fetch full order with items and profile
          try {
            const newOrder = await orderApi.get(payload.new.id);
            setOrders((prev) => {
              // Only add if it belongs to this merchant's list
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
            // Highlight and notify
            if (!knownOrderIds.current.has(newOrder.id)) {
              knownOrderIds.current.add(newOrder.id);
              setNewOrderIds((prev) => new Set([...prev, newOrder.id]));
              playNotification();
              // Remove highlight after 5 seconds
              setTimeout(() => {
                setNewOrderIds((prev) => {
                  const next = new Set(prev);
                  next.delete(newOrder.id);
                  return next;
                });
              }, 5000);
            }
          } catch {
            load(true);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          // Status updated — update in place
          try {
            const updated = await orderApi.get(payload.new.id);
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? updated : o))
            );
          } catch {
            load(true);
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setAdvancing(order.id);
    try {
      const updated = await orderApi.updateStatus(order.id, next);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(null);
    }
  }

  async function cancelOrder(order: Order) {
    setCancelling(order.id);
    setError("");
    try {
      // updateStatus (not orderApi.cancel) is used here because it also
      // re-selects profiles(full_name), keeping the customer name shown
      // on the card. It only runs the points/punch-card/streak RPCs when
      // status === "confirmed", so cancelling never touches those.
      const updated = await orderApi.updateStatus(order.id, "cancelled");
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancelling(null);
      setConfirmCancelId(null);
    }
  }

  const grouped = {
    incoming: orders.filter((o) => o.status === "pending"),
    active: orders.filter((o) =>
      ["confirmed", "preparing", "ready"].includes(o.status)
    ),
    done: orders.filter((o) => ["completed", "cancelled"].includes(o.status)),
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Live queue
          </p>
          <h1 className="font-display mt-1 text-5xl text-ink">Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Realtime status indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"
              }`}
            />
            <span className="text-[10px] text-muted-foreground">
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-mist px-4 text-xs font-medium text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Column title="Incoming" count={grouped.incoming.length} accent>
        {grouped.incoming.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onAdvance={() => advance(o)}
            advancing={advancing === o.id}
            onCancel={() => setConfirmCancelId(o.id)}
            cancelling={cancelling === o.id}
            confirming={confirmCancelId === o.id}
            onConfirmCancel={() => cancelOrder(o)}
            onDismissCancel={() => setConfirmCancelId(null)}
            isNew={newOrderIds.has(o.id)}
          />
        ))}
        {grouped.incoming.length === 0 && <Empty text="No new orders" />}
      </Column>

      <Column title="In progress" count={grouped.active.length}>
        {grouped.active.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onAdvance={() => advance(o)}
            advancing={advancing === o.id}
            onCancel={() => setConfirmCancelId(o.id)}
            cancelling={cancelling === o.id}
            confirming={confirmCancelId === o.id}
            onConfirmCancel={() => cancelOrder(o)}
            onDismissCancel={() => setConfirmCancelId(null)}
            isNew={false}
          />
        ))}
        {grouped.active.length === 0 && <Empty text="Nothing brewing" />}
      </Column>

      <Column title="Completed today" count={grouped.done.length}>
        {grouped.done.map((o) => (
          <OrderCard key={o.id} order={o} advancing={false} isNew={false} />
        ))}
        {grouped.done.length === 0 && <Empty text="Day's just starting" />}
      </Column>
    </div>
  );
}

function Column({
  title, count, accent, children,
}: {
  title: string; count: number; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-2 text-[11px] font-medium ${
          accent ? "gradient-ember text-white" : "bg-mist text-ink"
        }`}>
          {count}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="glass col-span-full rounded-2xl py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  advancing,
  onCancel,
  cancelling,
  confirming,
  onConfirmCancel,
  onDismissCancel,
  isNew,
}: {
  order: Order;
  onAdvance?: () => void;
  advancing: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
  confirming?: boolean;
  onConfirmCancel?: () => void;
  onDismissCancel?: () => void;
  isNew: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const canCancel = CANCELLABLE.includes(order.status);
  const mins = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 60_000
  );
  const customerName = order.profiles?.full_name ?? "Customer";

  return (
    <article className={`glass-strong rounded-3xl p-5 transition-all ${
      isNew ? "ring-2 ring-ember shadow-ember animate-pulse" : ""
    }`}>
      <div className="flex items-start justify-between">
        <div>
          {isNew && (
            <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-ember-soft px-2 py-0.5 text-[10px] font-medium text-ember">
              <Bell className="h-2.5 w-2.5" /> New order!
            </div>
          )}
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            #{order.id.slice(0, 8)}
          </p>
          <h3 className="font-display mt-1 text-xl text-ink">{customerName}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-medium ${STATUS_COLOR[order.status]}`}>
          {order.status}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {(order.order_items ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-ink">{item.quantity}× {item.name}</span>
            <span className="text-muted-foreground">
              NPR {Number(item.subtotal).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 border border-amber-100">
          📝 {order.notes}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {mins < 1 ? "Just now" : `${mins}m ago`}
        </span>
        <span className="font-display text-lg text-ink">
          NPR {Number(order.total_amount).toLocaleString()}
        </span>
      </div>

      {confirming ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">
            Cancel this order? This can't be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onConfirmCancel}
              disabled={cancelling}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-medium text-white disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Yes, cancel"
              )}
            </button>
            <button
              onClick={onDismissCancel}
              disabled={cancelling}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-border bg-white text-xs font-medium text-ink disabled:opacity-50"
            >
              Keep order
            </button>
          </div>
        </div>
      ) : (
        (next && onAdvance) || (canCancel && onCancel) ? (
          <div className="mt-4 flex gap-2">
            {next && onAdvance && (
              <button
                onClick={onAdvance}
                disabled={advancing}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {advancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {ADVANCE_LABEL[order.status]}
              </button>
            )}
            {canCancel && onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200 text-rose-500 transition-colors hover:bg-rose-50"
                aria-label="Cancel order"
                title="Cancel order"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : null
      )}
    </article>
  );
}
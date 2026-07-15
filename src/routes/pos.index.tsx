// routes/pos.index.tsx — POS main dashboard with order queue
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { orderApi, type Order, type OrderStatus } from "@/lib/api";
import {
  Loader2,
  Plus,
  Clock,
  Eye,
  CreditCard,
  Check,
  X,
  RefreshCw,
  Search,
  ShoppingBag,
  CreditCardIcon,
  Printer,
} from "lucide-react";

export const Route = createFileRoute("/pos/")({
  component: POSDashboard,
});

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-sky-100 text-sky-700",
  preparing: "bg-violet-100 text-violet-700",
  ready: "bg-emerald-100 text-emerald-700",
  completed: "bg-mist text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-500",
};

const ADVANCE_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: null, // payment handles this
  completed: null,
  cancelled: null,
};

const ADVANCE_LABEL: Record<OrderStatus, string> = {
  pending: "Confirm",
  confirmed: "Start Prep",
  preparing: "Mark Ready",
  ready: "Pay Now",
  completed: "Done",
  cancelled: "Cancelled",
};

type TabFilter = "all" | OrderStatus | "dine_in" | "pickup";

function POSDashboard() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const merchant = merchantProfile;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());

  const merchantId = merchant?.id;

  // Fetch active orders
  const fetchOrders = useCallback(async () => {
    if (!merchantId) return;
    try {
      const data = await orderApi.storeOrders();
      // Only show non-completed/non-cancelled orders
      const active = data.filter(
        (o) => o.status !== "completed" && o.status !== "cancelled"
      );
      setOrders(active);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!merchantId) return;

    const channel = supabase
      .channel("pos-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          if (
            newOrder.status === "completed" ||
            newOrder.status === "cancelled"
          ) {
            setOrders((prev) => prev.filter((o) => o.id !== newOrder.id));
          } else if (payload.eventType === "INSERT") {
            setOrders((prev) => [newOrder, ...prev]);
            setNewOrderIds((prev) => new Set(prev).add(newOrder.id));
            // Play notification sound
            try {
              const audio = new Audio(
                "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+JkIyEfnR1gIqOjYiCfHl5g4uOjIiCe3p6hIuOjIiCe3t7hIuOjIiCe3t7hIuOjIg="
              );
              audio.volume = 0.3;
              audio.play().catch(() => {});
            } catch {}
          } else {
            setOrders((prev) =>
              prev.map((o) => (o.id === newOrder.id ? newOrder : o))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId]);

  // Filter orders
  const filtered = useMemo(() => {
    let result = orders;
    if (activeTab === "dine_in") {
      result = result.filter((o) => o.order_type === "dine_in");
    } else if (activeTab === "pickup") {
      result = result.filter((o) => o.order_type === "pickup");
    } else if (activeTab !== "all") {
      result = result.filter((o) => o.status === activeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.table_name_snapshot?.toLowerCase().includes(q) ||
          o.walk_in_name?.toLowerCase().includes(q) ||
          o.receipt_number?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, activeTab, search]);

  // Tab counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      c[o.status] = (c[o.status] || 0) + 1;
    }
    return c;
  }, [orders]);

  async function handleAdvance(order: Order) {
    if (order.status === "ready") {
      navigate({ to: `/pos/payment/${order.id}` as any });
      return;
    }
    const next = ADVANCE_STATUS[order.status];
    if (!next) return;
    try {
      await orderApi.updateStatus(order.id, next);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: next } : o
        )
      );
    } catch {}
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "preparing", label: "Preparing" },
    { key: "ready", label: "Ready" },
    { key: "dine_in", label: "Dine-in" },
    { key: "pickup", label: "Pickup" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl text-ink">Orders</h1>
          <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {orders.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 rounded-lg bg-mist pl-9 pr-3 text-xs text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
            />
          </div>
          <button
            onClick={() => fetchOrders()}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-mist"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-ink text-primary-foreground"
                : "text-muted-foreground hover:bg-mist"
            }`}
          >
            {tab.label}
            {counts[tab.key] !== undefined && (
              <span className="ml-1 opacity-60">({counts[tab.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Link
          to="/pos/orders/new"
          search={{ type: "walk_in" }}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Walk-in Order
        </Link>
        <Link
          to="/pos/orders/new"
          search={{ type: "dine_in" }}
          className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
        >
          <Plus className="h-3.5 w-3.5" />
          New Table Order
        </Link>
        <Link
          to="/pos/credit"
          className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
        >
          <CreditCardIcon className="h-3.5 w-3.5" />
          Credit Accounts
        </Link>
      </div>

      {/* Order queue */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {orders.length === 0
            ? "No active orders"
            : "No orders match this filter"}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isNew={newOrderIds.has(order.id)}
              isExpanded={expandedId === order.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === order.id ? null : order.id)
              }
              onAdvance={handleAdvance}
              formatTimeAgo={formatTimeAgo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  isNew,
  isExpanded,
  onToggleExpand,
  onAdvance,
  formatTimeAgo,
}: {
  order: Order;
  isNew: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAdvance: (order: Order) => void;
  formatTimeAgo: (dateStr: string) => string;
}) {
  const isDineIn = order.order_type === "dine_in";
  const advanceLabel = ADVANCE_LABEL[order.status];

  return (
    <div
      className={`glass rounded-2xl p-4 transition-all ${
        isNew ? "ring-2 ring-amber-400 animate-pulse" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          {isDineIn ? (
            <p className="text-lg font-bold text-ink">
              {order.table_name_snapshot || "Table"}
            </p>
          ) : (
            <p className="text-lg font-bold text-amber-600">PICKUP</p>
          )}
          <p className="text-xs text-muted-foreground">
            #{order.receipt_number || order.id.slice(0, 8)}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[order.status]}`}
        >
          {order.status.toUpperCase()}
        </span>
      </div>

      {/* Customer info */}
      <div className="mt-2 text-xs text-muted-foreground">
        {isDineIn ? "Walk-in" : "Pickup"}
        {order.walk_in_name ? ` / ${order.walk_in_name}` : ""}
      </div>

      {/* Summary */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {order.order_items?.length ?? 0} items · NPR{" "}
          {Number(order.total_amount).toLocaleString()}
        </span>
        <span className="text-muted-foreground">
          {formatTimeAgo(order.created_at)}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 border-t border-border pt-3">
          {order.order_items?.map((item, i) => (
            <div key={i} className="flex justify-between py-0.5 text-xs">
              <span className="text-ink">
                {item.name} ×{item.quantity}
              </span>
              <span className="text-muted-foreground">
                NPR {Number(item.subtotal).toLocaleString()}
              </span>
            </div>
          ))}
          {order.notes && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              Note: {order.notes}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        {order.status !== "ready" && (
          <button
            onClick={() => onAdvance(order)}
            className="flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Check className="h-3 w-3" />
            {advanceLabel}
          </button>
        )}
        {order.status === "ready" && (
          <Link
            to={`/pos/payment/${order.id}` as any}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <CreditCard className="h-3 w-3" />
            Pay Now
          </Link>
        )}
        <Link
          to={`/pos/bill/${order.id}` as any}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
        >
          <Printer className="h-3 w-3" />
          Bill
        </Link>
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
        >
          <Eye className="h-3 w-3" />
          {isExpanded ? "Hide" : "Details"}
        </button>
      </div>
    </div>
  );
}

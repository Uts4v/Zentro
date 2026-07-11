import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Check, RefreshCw, Loader2, Clock, Bell, X,
  Search, Calendar, Trash2, ChevronDown, ChevronUp,
  UtensilsCrossed, ShoppingBag, Truck,
} from "lucide-react";
import { orderApi, type Order, type OrderStatus } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/merchant/orders")({
  head: () => ({ meta: [{ title: "Orders · Merchant" }] }),
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

const CANCELLABLE: OrderStatus[] = ["pending", "confirmed", "preparing"];

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function threeMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── Group history orders into time buckets ────────────────────────────────────

type HistoryGroup = { label: string; orders: Order[] };

function groupHistoryOrders(orders: Order[]): HistoryGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const cutoff = threeMonthsAgo();

  // Only show orders within 3 months
  const recent = orders.filter(
    (o) => new Date(o.created_at) >= cutoff
  );

  const groups: HistoryGroup[] = [];

  const today: Order[] = [];
  const thisWeek: Order[] = [];
  const thisMonth: Order[] = [];
  const byMonth: Record<string, Order[]> = {};

  for (const o of recent) {
    const d = new Date(o.created_at);
    if (d >= todayStart) {
      today.push(o);
    } else if (d >= weekStart) {
      thisWeek.push(o);
    } else if (d >= monthStart) {
      thisMonth.push(o);
    } else {
      const key = monthLabel(d);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(o);
    }
  }

  if (today.length) groups.push({ label: "Today", orders: today });
  if (thisWeek.length) groups.push({ label: "This week", orders: thisWeek });
  if (thisMonth.length) groups.push({ label: "This month", orders: thisMonth });

  // Past months sorted newest first
  const sortedMonths = Object.entries(byMonth).sort(
    ([a], [b]) => new Date(b).getTime() - new Date(a).getTime()
  );
  for (const [label, orders] of sortedMonths) {
    groups.push({ label, orders });
  }

  return groups;
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const knownOrderIds = useRef<Set<string>>(new Set());

  // ── History filters ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | "dine_in" | "pickup" | "delivery">("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function playNotification() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const data = await orderApi.storeOrders();
      setOrders(data);
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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("merchant-orders-realtime", {
        config: { presence: { key: "merchant" } },
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          try {
            const newOrder = await orderApi.get(payload.new.id);
            setOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
            if (!knownOrderIds.current.has(newOrder.id)) {
              knownOrderIds.current.add(newOrder.id);
              setNewOrderIds((prev) => new Set([...prev, newOrder.id]));
              playNotification();
              setTimeout(() => {
                setNewOrderIds((prev) => {
                  const next = new Set(prev);
                  next.delete(newOrder.id);
                  return next;
                });
              }, 5000);
            }
          } catch { load(true); }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          try {
            const updated = await orderApi.get(payload.new.id);
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          } catch { load(true); }
        }
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
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
      const updated = await orderApi.updateStatus(order.id, "cancelled");
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancelling(null);
      setConfirmCancelId(null);
    }
  }

  // ── Live queue groups ───────────────────────────────────────────────────────
  const liveOrders = {
    incoming: orders.filter((o) => o.status === "pending"),
    active: orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status)),
  };

  // ── History: filter + group ─────────────────────────────────────────────────
  const historyOrders = useMemo(() => {
    const cutoff = threeMonthsAgo();
    let filtered = orders.filter(
      (o) =>
        ["completed", "cancelled"].includes(o.status) &&
        new Date(o.created_at) >= cutoff
    );

    // Search by customer name or order ID
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          (o.profiles?.full_name ?? "").toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.order_items ?? []).some((i) => i.name.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    // Order type filter
    if (orderTypeFilter !== "all") {
      filtered = filtered.filter((o) => o.order_type === orderTypeFilter);
    }

    // Table filter
    if (tableFilter !== "all") {
      if (tableFilter === "dine_in") {
        filtered = filtered.filter((o) => o.order_type === "dine_in");
      } else if (tableFilter === "no_table") {
        filtered = filtered.filter((o) => !o.table_id);
      } else {
        filtered = filtered.filter((o) => o.table_name_snapshot === tableFilter);
      }
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((o) => new Date(o.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((o) => new Date(o.created_at) <= to);
    }

    return filtered;
  }, [orders, search, statusFilter, dateFrom, dateTo]);

  const historyGroups = useMemo(
    () => groupHistoryOrders(historyOrders),
    [historyOrders]
  );

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setOrderTypeFilter("all");
    setTableFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  const hasFilters = search || statusFilter !== "all" || orderTypeFilter !== "all" || tableFilter !== "all" || dateFrom || dateTo;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {activeTab === "live" ? "Live queue" : "Order history"}
          </p>
          <h1 className="font-display mt-1 text-5xl text-ink">Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"}`} />
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

      {/* Tab switcher */}
      <div className="flex gap-2 rounded-2xl bg-mist p-1">
        {(["live", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? "bg-ink text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {tab === "live" ? (
              <span className="flex items-center justify-center gap-2">
                Live queue
                {liveOrders.incoming.length > 0 && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ember text-[10px] font-bold text-white">
                    {liveOrders.incoming.length}
                  </span>
                )}
              </span>
            ) : "History"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ── LIVE TAB ── */}
      {activeTab === "live" && (
        <div className="space-y-8">
          <Column title="Incoming" count={liveOrders.incoming.length} accent>
            {liveOrders.incoming.map((o) => (
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
            {liveOrders.incoming.length === 0 && <Empty text="No new orders" />}
          </Column>

          <Column title="In progress" count={liveOrders.active.length}>
            {liveOrders.active.map((o) => (
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
            {liveOrders.active.length === 0 && <Empty text="Nothing brewing" />}
          </Column>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div className="space-y-5">
          {/* Search + filters */}
          <div className="glass-strong rounded-2xl p-4 space-y-3">
            {/* Search bar */}
            <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer name, order ID, item…"
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground/70"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-ink">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status + date filters */}
            <div className="flex flex-wrap gap-2">
              {/* Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-9 rounded-xl border border-border bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Order type */}
              <select
                value={orderTypeFilter}
                onChange={(e) => setOrderTypeFilter(e.target.value as any)}
                className="h-9 rounded-xl border border-border bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="all">All types</option>
                <option value="dine_in">Dine-in</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>

              {/* Date from */}
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 bg-transparent text-xs text-ink outline-none"
                  placeholder="From"
                />
              </div>

              {/* Date to */}
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 bg-transparent text-xs text-ink outline-none"
                  placeholder="To"
                />
              </div>

              {/* Clear filters */}
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-ink">{historyOrders.length}</span> orders found
              </span>
              <span>
                <span className="font-medium text-ink">
                  NPR {historyOrders.reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString()}
                </span>{" "}
                total revenue
              </span>
              <span className="ml-auto text-[11px]">
                Showing last 3 months only
              </span>
            </div>
          </div>

          {/* Grouped history */}
          {historyGroups.length === 0 ? (
            <div className="glass rounded-2xl py-16 text-center">
              <p className="text-3xl">📭</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {hasFilters ? "No orders match your filters" : "No order history yet"}
              </p>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 text-xs text-ember underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {historyGroups.map(({ label, orders: groupOrders }) => {
                const isCollapsed = collapsedGroups.has(label);
                const groupTotal = groupOrders.reduce(
                  (s, o) => s + Number(o.total_amount), 0
                );
                return (
                  <section key={label} className="glass-strong rounded-2xl overflow-hidden">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(label)}
                      className="flex w-full items-center justify-between px-5 py-4 hover:bg-mist/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-lg text-ink">{label}</h3>
                        <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-medium text-ink">
                          {groupOrders.length} order{groupOrders.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-ink">
                          NPR {groupTotal.toLocaleString()}
                        </span>
                        {isCollapsed
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                    </button>

                    {/* Group orders */}
                    {!isCollapsed && (
                      <div className="border-t border-border divide-y divide-border">
                        {groupOrders.map((o) => (
                          <HistoryRow key={o.id} order={o} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History row (compact) ─────────────────────────────────────────────────────

function HistoryRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const customerName = order.profiles?.full_name ?? "Customer";
  const date = new Date(order.created_at).toLocaleDateString("en-NP", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-mist/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-ink truncate">{customerName}</p>
            {order.order_type === "dine_in" && order.table_name_snapshot && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <UtensilsCrossed className="h-2.5 w-2.5" />
                {order.table_name_snapshot}
              </span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_COLOR[order.status]}`}>
              {order.status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            #{order.id.slice(0, 8)} · {date}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-base text-ink">
            NPR {Number(order.total_amount).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {(order.order_items ?? []).length} item{(order.order_items ?? []).length !== 1 ? "s" : ""}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 space-y-2 bg-mist/20">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {order.order_type && (
              <span className="inline-flex items-center gap-1">
                {order.order_type === "dine_in" ? <UtensilsCrossed className="h-3 w-3" /> :
                 order.order_type === "delivery" ? <Truck className="h-3 w-3" /> :
                 <ShoppingBag className="h-3 w-3" />}
                {order.order_type === "dine_in" ? "Dine-in" : order.order_type === "delivery" ? "Delivery" : "Pickup"}
              </span>
            )}
            {order.order_type === "dine_in" && order.table_name_snapshot && (
              <span className="font-medium text-ink">Table: {order.table_name_snapshot}</span>
            )}
          </div>
          <ul className="space-y-1">
            {(order.order_items ?? []).map((item) => (
              <li key={item.id} className="flex justify-between text-xs">
                <span className="text-ink">{item.quantity}× {item.name}</span>
                <span className="text-muted-foreground">NPR {Number(item.subtotal).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          {order.notes && (
            <p className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              📝 {order.notes}
            </p>
          )}
          {order.points_earned > 0 && (
            <p className="text-xs text-emerald-600">✦ {order.points_earned} pts earned by customer</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live queue components ─────────────────────────────────────────────────────

function Column({ title, count, accent, children }: {
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
  order, onAdvance, advancing, onCancel, cancelling,
  confirming, onConfirmCancel, onDismissCancel, isNew,
}: {
  order: Order; onAdvance?: () => void; advancing: boolean;
  onCancel?: () => void; cancelling?: boolean; confirming?: boolean;
  onConfirmCancel?: () => void; onDismissCancel?: () => void; isNew: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const canCancel = CANCELLABLE.includes(order.status);
  const mins = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
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
          {/* Table badge - prominent for dine-in */}
          {order.order_type === "dine_in" && order.table_name_snapshot && (
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              <UtensilsCrossed className="h-3 w-3" />
              {order.table_name_snapshot}
            </div>
          )}
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">#{order.id.slice(0, 8)}</p>
          <h3 className="font-display mt-1 text-xl text-ink">{customerName}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          {order.order_type && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              order.order_type === "dine_in" ? "bg-amber-50 text-amber-700" :
              order.order_type === "delivery" ? "bg-blue-50 text-blue-700" :
              "bg-gray-100 text-gray-700"
            }`}>
              {order.order_type === "dine_in" ? <UtensilsCrossed className="h-2.5 w-2.5" /> :
               order.order_type === "delivery" ? <Truck className="h-2.5 w-2.5" /> :
               <ShoppingBag className="h-2.5 w-2.5" />}
              {order.order_type === "dine_in" ? "Dine-in" : order.order_type === "delivery" ? "Delivery" : "Pickup"}
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-medium ${STATUS_COLOR[order.status]}`}>
            {order.status}
          </span>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {(order.order_items ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-ink">{item.quantity}× {item.name}</span>
            <span className="text-muted-foreground">NPR {Number(item.subtotal).toLocaleString()}</span>
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
          <p className="text-xs text-rose-700">Cancel this order? This can't be undone.</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onConfirmCancel}
              disabled={cancelling}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-medium text-white disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, cancel"}
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
        ((next && onAdvance) || (canCancel && onCancel)) ? (
          <div className="mt-4 flex gap-2">
            {next && onAdvance && (
              <button
                onClick={onAdvance}
                disabled={advancing}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {ADVANCE_LABEL[order.status]}
              </button>
            )}
            {canCancel && onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200 text-rose-500 transition-colors hover:bg-rose-50"
                aria-label="Cancel order"
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
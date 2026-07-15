// routes/pos.tsx — POS layout shell with top bar + shift status
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { shiftApi, type CashShift } from "@/lib/pos-api";
import { getShiftWorker, clearShiftWorker, type ShiftWorkerSession } from "@/lib/shift-worker";
import {
  Loader2,
  LogOut,
  ShoppingCart,
  Plus,
  Clock,
  CreditCard,
  AlertTriangle,
  User,
} from "lucide-react";

export const Route = createFileRoute("/pos")({
  head: () => ({ meta: [{ title: "Zentro POS" }] }),
  component: POSLayout,
});

function POSLayout() {
  const { user, merchantProfile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [shift, setShift] = useState<CashShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [worker, setWorker] = useState<ShiftWorkerSession | null>(null);

  useEffect(() => {
    const w = getShiftWorker();
    setWorker(w);
  }, []);

  const fetchShift = useCallback(async () => {
    try {
      const s = await shiftApi.currentShift();
      setShift(s);
    } catch {
      setShift(null);
    } finally {
      setShiftLoading(false);
    }
  }, []);

  useEffect(() => {
    if (merchantProfile) fetchShift();
  }, [merchantProfile, fetchShift]);

  async function handleSignOut() {
    clearShiftWorker();
    navigate({ to: "/auth/shift" as any, replace: true });
  }

  if (loading || !user || !merchantProfile) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navItems = [
    { to: "/pos", label: "Orders", icon: ShoppingCart },
    { to: "/pos/orders/new", label: "New Order", icon: Plus },
    { to: "/pos/shift", label: "Shift", icon: Clock },
    { to: "/pos/credit", label: "Credit", icon: CreditCard },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur-xl">
        <Link to="/pos" className="font-display text-lg text-ink">
          Zentro <span className="text-ember">POS</span>
        </Link>

        <span className="text-sm font-medium text-ink">
          {merchantProfile?.store_name ?? "Zentro POS"}
        </span>

        <div className="flex items-center gap-3">
          <Link
            to="/merchant"
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist hover:text-ink"
          >
            Dashboard
          </Link>
          {worker && (
            <span className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-1.5 text-xs font-medium text-ink">
              <User className="h-3.5 w-3.5" />
              {worker.name}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Shift status bar */}
      {shiftLoading ? (
        <div className="flex items-center justify-center border-b border-border py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : shift ? (
        <div className="flex items-center justify-between border-b border-border bg-emerald-50/50 px-4 py-2 text-xs text-emerald-800">
          <span>
            Shift open since{" "}
            {new Date(shift.opened_at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · Opening cash: NPR {shift.opening_cash}
          </span>
          <div className="flex items-center gap-2">
            <Link
              to="/pos/shift"
              className="rounded-lg bg-emerald-100 px-2.5 py-1 font-medium transition-colors hover:bg-emerald-200"
            >
              View Shift Details
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-border bg-amber-50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            No active shift. Start a shift before processing orders.
          </div>
          <Link
            to="/pos/shift"
            className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200"
          >
            Start Shift
          </Link>
        </div>
      )}

      {/* Nav tabs */}
      <nav className="flex gap-1 border-b border-border px-4 py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/pos"
              ? path === "/pos" || path === "/pos/"
              : path.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to as any}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ink text-primary-foreground"
                  : "text-muted-foreground hover:bg-mist hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
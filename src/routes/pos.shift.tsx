// routes/pos.shift.tsx — Shift management page
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { getShiftWorker } from "@/lib/shift-worker";
import {
  shiftApi,
  type CashShift,
  type CashDrop,
  type ShiftSummary,
} from "@/lib/pos-api";
import {
  Loader2,
  ArrowLeft,
  Clock,
  Banknote,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
} from "lucide-react";

export const Route = createFileRoute("/pos/shift")({
  head: () => ({ meta: [{ title: "Shift · Zentro POS" }] }),
  component: ShiftPage,
});

function ShiftPage() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const merchant = merchantProfile;

  const [shift, setShift] = useState<CashShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [drops, setDrops] = useState<CashDrop[]>([]);

  // Modal states
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDropModal, setShowDropModal] = useState(false);

  // Open shift form
  const [openingCash, setOpeningCash] = useState("");
  const [openNotes, setOpenNotes] = useState("");

  // Close shift form
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // Cash movement form
  const [dropType, setDropType] = useState<"drop" | "payout">("payout");
  const [dropAmount, setDropAmount] = useState("");
  const [dropReason, setDropReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShift = useCallback(async () => {
    try {
      const s = await shiftApi.currentShift();
      setShift(s);
      if (s) {
        const [sum, drps] = await Promise.all([
          shiftApi.getShiftSummary(s.id),
          shiftApi.getShiftDrops(s.id),
        ]);
        setSummary(sum);
        setDrops(drps);
      }
    } catch {
      setShift(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (merchant) fetchShift();
  }, [merchant, fetchShift]);

  async function handleOpenShift() {
    const cash = parseFloat(openingCash);
    if (isNaN(cash) || cash < 0) {
      setError("Opening cash must be a non-negative number");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const worker = getShiftWorker();
      await shiftApi.openShift(cash, openNotes, worker?.name ?? undefined);
      setShowOpenModal(false);
      setOpeningCash("");
      setOpenNotes("");
      await fetchShift();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseShift() {
    const cash = parseFloat(actualCash);
    if (isNaN(cash) || cash < 0) {
      setError("Actual cash must be a non-negative number");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await shiftApi.closeShift(shift!.id, cash, closeNotes);
      setShowCloseModal(false);
      setActualCash("");
      setCloseNotes("");
      await fetchShift();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordDrop() {
    const amt = parseFloat(dropAmount);
    if (isNaN(amt) || amt <= 0) {
      setError("Amount must be positive");
      return;
    }
    if (!dropReason.trim()) {
      setError("Reason is required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await shiftApi.recordCashMovement(shift!.id, amt, dropType, dropReason);
      setShowDropModal(false);
      setDropAmount("");
      setDropReason("");
      await fetchShift();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const expectedInDrawer = summary
    ? summary.opening_cash +
      summary.cash_sales +
      summary.cash_drops -
      summary.cash_payouts
    : 0;

  const closeDiff =
    summary && actualCash
      ? parseFloat(actualCash) -
        (summary.opening_cash +
          summary.cash_sales +
          summary.cash_drops -
          summary.cash_payouts)
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No active shift
  if (!shift) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <button
          onClick={() => navigate({ to: "/pos" as any })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </button>

        <div className="glass rounded-2xl p-6 text-center">
          <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="font-display mt-3 text-2xl text-ink">No Active Shift</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a shift to begin processing orders and tracking cash.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-3 text-left">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Opening cash count
              </label>
              <input
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="How much cash is in the drawer?"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Notes (optional)
              </label>
              <input
                type="text"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="e.g. Starting shift handover from Priya"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <button
              onClick={handleOpenShift}
              disabled={submitting}
              className="grid h-12 w-full place-items-center rounded-xl bg-ink text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Start Shift"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active shift
  return (
    <div className="mx-auto max-w-2xl space-y-4">
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

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">Your Active Shift</h2>
            <p className="text-xs text-muted-foreground">
              Opened at{" "}
              {new Date(shift.opened_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {shift.worker_name && ` · ${shift.worker_name}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDropModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              <Plus className="h-3 w-3" />
              Cash Drop / Payout
            </button>
            <button
              onClick={() => setShowCloseModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Close Shift
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <Row label="Opening cash" value={`NPR ${summary.opening_cash.toLocaleString()}`} />
            <Row label="Cash sales" value={`NPR ${summary.cash_sales.toLocaleString()}`} />
            <Row label="Fonepay sales" value={`NPR ${summary.fonepay_sales.toLocaleString()}`} />
            <Row label="Credit charges" value={`NPR ${summary.credit_charges.toLocaleString()}`} />
            <Row label="Walk-in orders" value={String(summary.walk_in_orders)} />
            <Row label="Total orders" value={String(summary.total_orders)} />
            <div className="border-t border-border pt-2">
              <Row label="Cash drops (added)" value={`NPR ${summary.cash_drops.toLocaleString()}`} />
              <Row label="Cash payouts" value={`NPR ${summary.cash_payouts.toLocaleString()}`} />
            </div>
            <div className="border-t border-border pt-2">
              <Row
                label="Expected in drawer"
                value={`NPR ${expectedInDrawer.toLocaleString()}`}
                bold
              />
            </div>
          </div>
        )}
      </div>

      {/* Drops log */}
      {drops.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-medium text-ink">Cash Movements</h3>
          <div className="mt-3 space-y-2">
            {drops.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-mist px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  {d.direction === "drop" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                  )}
                  <span className="font-medium text-ink">
                    {d.direction === "drop" ? "DROP" : "PAYOUT"}
                  </span>
                  <span className="text-muted-foreground">{d.reason}</span>
                </div>
                <span
                  className={`font-medium ${
                    d.direction === "drop" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  NPR {d.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash Drop/Payout Modal */}
      {showDropModal && (
        <Modal onClose={() => setShowDropModal(false)}>
          <h3 className="font-display text-xl text-ink">Record Cash Movement</h3>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Type
              </label>
              <div className="mt-1.5 flex gap-2">
                {(["drop", "payout"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDropType(t)}
                    className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-medium transition-colors ${
                      dropType === t
                        ? t === "drop"
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                        : "border border-border text-muted-foreground hover:bg-mist"
                    }`}
                  >
                    {t === "drop" ? "↓ Cash Drop (adding)" : "↑ Cash Payout (removing)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Amount
              </label>
              <input
                type="number"
                value={dropAmount}
                onChange={(e) => setDropAmount(e.target.value)}
                placeholder="NPR"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Reason
              </label>
              <input
                type="text"
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                placeholder="e.g. cigarettes for store"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDropModal(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordDrop}
                disabled={submitting}
                className="flex-1 rounded-xl bg-ink py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Record"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && (
        <Modal onClose={() => setShowCloseModal(false)}>
          <h3 className="font-display text-xl text-ink">Close Shift</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Please count the cash in your drawer.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Expected in drawer
              </label>
              <p className="mt-1 text-lg font-medium text-ink">
                NPR {expectedInDrawer.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Actual cash counted
              </label>
              <input
                type="number"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="NPR"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            {actualCash && (
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Difference
                </label>
                <p
                  className={`mt-1 text-lg font-medium ${
                    closeDiff === 0
                      ? "text-emerald-600"
                      : closeDiff > 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  NPR {closeDiff.toLocaleString()}{" "}
                  {closeDiff === 0
                    ? "✓"
                    : closeDiff > 0
                    ? "(over)"
                    : "(short — please investigate)"}
                </p>
              </div>
            )}
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Notes
              </label>
              <input
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="e.g. NPR 20 short — will check CCTV"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseShift}
                disabled={submitting || !actualCash}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Confirm Close Shift"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-medium text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-mist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { shiftApi, type CashShift, type ShiftSummary } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Eye, ChevronDown, ChevronUp, FileText, Clock } from "lucide-react";

export const Route = createFileRoute("/merchant/shifts")({
  head: () => ({ meta: [{ title: "Shifts · Merchant" }] }),
  component: MerchantShifts,
});

type FilterTab = "all" | "week" | "month";

function MerchantShifts() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    shiftApi
      .shiftHistory()
      .then((data) => {
        if (!cancelled) setShifts(data);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Failed to load shifts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === "all") return shifts;
    const now = new Date();
    const cutoff = new Date();
    if (activeTab === "week") {
      cutoff.setDate(now.getDate() - now.getDay());
      cutoff.setHours(0, 0, 0, 0);
    } else {
      cutoff.setDate(1);
      cutoff.setHours(0, 0, 0, 0);
    }
    return shifts.filter((s) => new Date(s.opened_at) >= cutoff);
  }, [shifts, activeTab]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

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
            Shift history
          </p>
          <h1 className="font-display mt-1 text-5xl text-ink">Shifts</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to="/pos/shift"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-xs font-medium text-primary-foreground"
          >
            <Clock className="h-3.5 w-3.5" />
            Go to Shifts
          </Link>
          <Link
            to="/merchant/daily-report"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-mist px-4 text-xs font-medium text-ink"
          >
            <FileText className="h-3.5 w-3.5" />
            Daily Report
          </Link>
          <button
            onClick={() => navigate({ to: "/merchant" })}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-mist px-4 text-xs font-medium text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 rounded-2xl bg-mist p-1">
        {([
          { key: "all", label: "All" },
          { key: "week", label: "This week" },
          { key: "month", label: "This month" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-ink text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Shift table */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {shifts.length === 0
              ? "No shifts recorded yet"
              : "No shifts match this filter"}
          </p>
        </div>
      ) : (
        <div className="glass-strong rounded-3xl overflow-hidden">
          {/* Table header */}
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-border px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground md:grid">
            <span>Date</span>
            <span>Opened By</span>
            <span>Closed By</span>
            <span className="text-right">Opening</span>
            <span className="text-right">Closing</span>
            <span className="text-right">Difference</span>
            <span className="text-right">Status</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((shift) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              expanded={expandedId === shift.id}
              onToggle={() => toggleExpand(shift.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shift row ─────────────────────────────────────────────────────────────────

function ShiftRow({
  shift,
  expanded,
  onToggle,
}: {
  shift: CashShift;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<{
    summary: ShiftSummary;
    closingDiff: number;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const dateStr = new Date(shift.opened_at).toLocaleDateString("en-NP", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date(shift.opened_at).toLocaleTimeString("en-NP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const closingStr =
    shift.closing_cash_actual != null
      ? `NPR ${Number(shift.closing_cash_actual).toLocaleString()}`
      : "—";

  const diff = shift.cash_difference;
  const diffStr =
    diff != null ? `NPR ${Number(diff).toLocaleString()}` : "—";
  const diffColor =
    diff != null
      ? Number(diff) < 0
        ? "text-rose-600"
        : "text-emerald-600"
      : "text-muted-foreground";

  async function handleExpand() {
    onToggle();
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try {
        const [summary, drops] = await Promise.all([
          shiftApi.getShiftSummary(shift.id),
          shiftApi.getShiftDrops(shift.id),
        ]);
        const closingDiff =
          shift.closing_cash_actual != null
            ? shift.closing_cash_actual -
              (summary.opening_cash +
                summary.cash_sales -
                summary.cash_drops -
                summary.cash_payouts)
            : 0;
        setDetail({ summary, closingDiff });
      } catch {
        // silently fail — detail stays null
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  return (
    <div>
      <div
        className="grid grid-cols-1 items-center gap-4 px-6 py-4 transition-colors hover:bg-mist/30 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]"
      >
        {/* Date */}
        <div>
          <p className="text-sm font-medium text-ink">{dateStr}</p>
          <p className="text-xs text-muted-foreground">{timeStr}</p>
        </div>

        {/* Opened By */}
        <span className="text-sm text-ink">
          {shift.worker_name || shift.opener_name || "Unknown"}
        </span>

        {/* Closed By */}
        <span className="text-sm text-ink">
          {shift.closer_name ?? (shift.status === "open" ? "Still open" : "—")}
        </span>

        {/* Opening Cash */}
        <span className="text-right text-sm text-ink">
          NPR {Number(shift.opening_cash).toLocaleString()}
        </span>

        {/* Closing Cash */}
        <span className="text-right text-sm text-ink">{closingStr}</span>

        {/* Difference */}
        <span className={`text-right text-sm font-medium ${diffColor}`}>
          {diffStr}
        </span>

        {/* Status */}
        <div className="text-right">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase ${
              shift.status === "open"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-mist text-muted-foreground"
            }`}
          >
            {shift.status}
          </span>
        </div>

        {/* View button */}
        <div className="ml-auto flex gap-1.5">
          <Link
            to="/merchant/shift-report/$shiftId"
            params={{ shiftId: shift.id }}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-mist transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Report
          </Link>
          <button
            onClick={handleExpand}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-mist px-3 text-xs font-medium text-ink hover:bg-mist/70 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            View
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-mist/20 px-6 py-5">
          {loadingDetail ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <ShiftDetail shift={shift} summary={detail.summary} closingDiff={detail.closingDiff} />
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Could not load shift details
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shift detail panel ────────────────────────────────────────────────────────

function ShiftDetail({
  shift,
  summary,
  closingDiff,
}: {
  shift: CashShift;
  summary: ShiftSummary;
  closingDiff: number;
}) {
  const expectedClosing =
    summary.opening_cash +
    summary.cash_sales -
    summary.cash_drops -
    summary.cash_payouts;

  const diffColor =
    closingDiff < 0
      ? "text-rose-600"
      : closingDiff === 0
      ? "text-emerald-600"
      : "text-emerald-600";

  return (
    <div className="space-y-5">
      {/* Cash Summary */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Cash Summary
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <DetailStat label="Opening Cash" value={summary.opening_cash} />
          <DetailStat label="Cash Sales" value={summary.cash_sales} />
          <DetailStat label="Drops" value={summary.cash_drops} />
          <DetailStat label="Payouts" value={summary.cash_payouts} />
          <DetailStat label="Expected Closing" value={expectedClosing} />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Difference
            </p>
            <p className={`font-display mt-1 text-xl ${diffColor}`}>
              NPR {closingDiff.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Sales Summary */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Sales Summary
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <DetailStat label="Cash" value={summary.cash_sales} />
          <DetailStat label="Fonepay" value={summary.fonepay_sales} />
          <DetailStat label="Credit" value={summary.credit_charges} />
          <DetailStat label="Split" value={summary.split_sales} />
          <DetailStat
            label="Total Orders"
            value={summary.total_orders}
            isCount
          />
        </div>
      </div>

      {/* Walk-in stat */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-ink">{summary.walk_in_orders}</span>{" "}
          walk-in orders
        </span>
        <span>
          <span className="font-medium text-ink">{summary.total_orders}</span>{" "}
          total orders
        </span>
      </div>
    </div>
  );
}

// ── Detail stat card ──────────────────────────────────────────────────────────

function DetailStat({
  label,
  value,
  isCount,
}: {
  label: string;
  value: number;
  isCount?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display mt-1 text-xl text-ink">
        {isCount ? value : `NPR ${Number(value).toLocaleString()}`}
      </p>
    </div>
  );
}

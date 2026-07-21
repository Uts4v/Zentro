// routes/merchant.daily-report.tsx — End-of-day report with print/download
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { reportApi, type DailyReportData } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Printer, Download, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/merchant/daily-report")({
  head: () => ({ meta: [{ title: "Daily Report · Zentro" }] }),
  component: DailyReportPage,
});

function DailyReportPage() {
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    orders: false,
    items: false,
    drops: false,
    staff: false,
    credit: false,
  });

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    setLoading(true);
    setError(null);
    reportApi
      .getDailyReport(date)
      .then(setReport)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  function handlePrint() {
    window.print();
  }

  async function handleDownload() {
    if (!reportRef.current || !report) return;
    setDownloading(true);
    setError(null);
    try {
      const { domToPng } = await import("modern-screenshot");
      const dataUrl = await domToPng(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        timeout: 15000,
      });
      const link = document.createElement("a");
      link.download = `daily-report-${report.date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
      setError(`Download failed: ${e instanceof Error ? e.message : "Unknown error"}. Use Print button instead.`);
    } finally {
      setDownloading(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  const fmt = (n: number) => `NPR ${n.toLocaleString()}`;
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-NP", { hour: "2-digit", minute: "2-digit" });
  const dateShort = (iso: string) =>
    new Date(iso).toLocaleDateString("en-NP", { month: "short", day: "numeric" });
  const methodLabel: Record<string, string> = {
    cash: "Cash",
    fonepay: "FonePay",
    credit: "Credit",
    split: "Split",
  };
  const statusColor: Record<string, string> = {
    pending: "text-amber-600",
    confirmed: "text-blue-600",
    preparing: "text-purple-600",
    ready: "text-emerald-600",
    completed: "text-emerald-600",
    cancelled: "text-rose-600",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/merchant" })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
          >
            <Printer className="h-3 w-3" />
            Print
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || !report}
            className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download PNG
          </button>
        </div>
      </div>

      {/* Date picker */}
      <div className="no-print glass rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => changeDate(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist">‹</button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-ink">
              {new Date(date + "T12:00:00").toLocaleDateString("en-NP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <button onClick={() => changeDate(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist">›</button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="receipt glass rounded-2xl p-6 space-y-0">
          {/* ── Header ── */}
          <div className="border-b border-border pb-3 text-center">
            <h2 className="font-display text-xl text-ink">Daily Report</h2>
            {report.merchant_address && <p className="text-[10px] text-muted-foreground">{report.merchant_address}</p>}
            {report.merchant_phone && <p className="text-[10px] text-muted-foreground">Tel: {report.merchant_phone}</p>}
            <p className="mt-2 text-sm font-semibold text-ink">
              DAILY REPORT — {new Date(date + "T12:00:00").toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>

          {/* ── Shifts ── */}
          <Section title="Shifts">
            {report.shifts.length === 0 ? (
              <p className="text-muted-foreground text-xs">No shifts recorded</p>
            ) : (
              <div className="space-y-2">
                {report.shifts.map((s) => {
                  const openedAt = new Date(s.opened_at);
                  const closedAt = s.closed_at ? new Date(s.closed_at) : null;
                  return (
                    <div key={s.id} className="rounded-xl bg-white/60 p-2.5">
                      <div className="flex justify-between">
                        <span className="font-medium text-ink">{s.worker_name || s.opener_name}</span>
                        <span className={`text-[10px] font-medium ${s.status === "open" ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {s.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>
                          {time(s.opened_at)}
                          {closedAt ? ` — ${time(s.closed_at!)}` : " — open"}
                        </span>
                        <span>
                          Cash: {fmt(s.opening_cash)}
                          {s.closing_cash_actual != null ? ` → ${fmt(s.closing_cash_actual)}` : ""}
                        </span>
                      </div>
                      {s.cash_difference != null && (
                        <div className={`mt-0.5 text-[10px] ${s.cash_difference < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          Diff: {fmt(s.cash_difference)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Sales Summary ── */}
          <Section title="Sales Summary">
            <div className="space-y-1">
              <Row label="Total paid orders" value={String(report.totals.total_orders)} bold />
              <Row label="Items sold" value={String(report.totals.total_items_sold)} />
              <div className="border-t border-border pt-1 mt-1 space-y-1">
                <Row label="Cash sales" value={fmt(report.totals.cash_sales)} />
                <Row label="FonePay sales" value={fmt(report.totals.fonepay_sales)} />
                <Row label="Credit sales" value={fmt(report.totals.credit_sales)} />
                <Row label="Split sales" value={fmt(report.totals.split_sales)} />
              </div>
              {report.totals.total_discount > 0 && (
                <Row label="Discounts given" value={`-${fmt(report.totals.total_discount)}`} valueColor="text-emerald-600" />
              )}
              <div className="border-t border-border pt-1 mt-1">
                <Row label="Total revenue" value={fmt(report.totals.total_sales)} bold />
              </div>
            </div>
          </Section>

          {/* ── Order Breakdown ── */}
          <Section title="Order Breakdown">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">By customer type</p>
              <Row label={`Walk-in (${report.totals.walk_in_orders})`} value={fmt(report.totals.walk_in_sales)} />
              <Row label={`Registered (${report.totals.registered_orders})`} value={fmt(report.totals.registered_sales)} />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2">By order type</p>
              <Row label={`Dine-in (${report.totals.dine_in_orders})`} value={fmt(report.totals.dine_in_sales)} />
              <Row label={`Pickup (${report.totals.pickup_orders})`} value={fmt(report.totals.pickup_sales)} />
              {report.totals.delivery_orders > 0 && (
                <Row label={`Delivery (${report.totals.delivery_orders})`} value={fmt(report.totals.delivery_sales)} />
              )}
              {report.totals.cancelled_orders > 0 && (
                <div className="border-t border-border pt-1 mt-1">
                  <Row label={`Cancelled (${report.totals.cancelled_orders})`} value={`-${fmt(report.totals.cancelled_total)}`} valueColor="text-rose-600" />
                </div>
              )}
              <div className="border-t border-border pt-1 mt-1">
                <Row label="Loyalty points earned" value={String(report.totals.total_points_earned)} />
              </div>
            </div>
          </Section>

          {/* ── Cash Summary ── */}
          <Section title="Cash Summary">
            <div className="space-y-1">
              <Row label="Opening cash" value={fmt(report.totals.opening_cash)} />
              <Row label="Cash drops" value={`+${fmt(report.totals.cash_drops)}`} valueColor="text-emerald-600" />
              <Row label="Cash payouts" value={`-${fmt(report.totals.cash_payouts)}`} valueColor="text-rose-600" />
              {report.totals.closing_cash > 0 && (
                <Row label="Closing cash" value={fmt(report.totals.closing_cash)} />
              )}
              {report.totals.cash_difference !== 0 && (
                <div className="border-t border-border pt-1 mt-1">
                  <Row
                    label="Total difference"
                    value={fmt(report.totals.cash_difference)}
                    bold
                    valueColor={report.totals.cash_difference < 0 ? "text-rose-600" : "text-emerald-600"}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Staff Performance ── */}
          {report.staff_activity.length > 0 && (
            <CollapsibleSection
              title={`Staff Performance (${report.staff_activity.length})`}
              expanded={expandedSections.staff}
              onToggle={() => toggleSection("staff")}
            >
              <div className="space-y-1.5">
                {report.staff_activity.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="text-muted-foreground">
                      {s.order_count} order{s.order_count !== 1 ? "s" : ""} · {fmt(s.total_sales)}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Cash Drops Detail ── */}
          {report.drops.length > 0 && (
            <CollapsibleSection
              title={`Cash Movements (${report.drops.length})`}
              expanded={expandedSections.drops}
              onToggle={() => toggleSection("drops")}
            >
              <div className="space-y-1.5">
                {report.drops.map((d) => (
                  <div key={d.id} className="rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${d.direction === "drop" ? "text-amber-600" : "text-rose-600"}`}>
                        {d.direction === "drop" ? "DROP" : "PAYOUT"} — {fmt(d.amount)}
                      </span>
                      <span className="text-muted-foreground">{time(d.created_at)}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{d.reason}</p>
                    <p className="text-muted-foreground text-[10px]">
                      By: {d.recorder_name}{d.shift_worker_name ? ` · Shift: ${d.shift_worker_name}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Credit Activity ── */}
          {report.credit_activity.length > 0 && (
            <CollapsibleSection
              title={`Credit Activity (${report.credit_activity.length})`}
              expanded={expandedSections.credit}
              onToggle={() => toggleSection("credit")}
            >
              <div className="space-y-1 mb-2">
                <Row label="Total credit charges" value={fmt(report.totals.credit_charges)} />
                <Row label="Total credit payments" value={fmt(report.totals.credit_payments)} valueColor="text-emerald-600" />
              </div>
              <div className="space-y-1.5">
                {report.credit_activity.map((t) => (
                  <div key={t.id} className="rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${t.type === "charge" ? "text-rose-600" : "text-emerald-600"}`}>
                        {t.type === "charge" ? "CHARGE" : "PAYMENT"} — {fmt(t.amount)}
                      </span>
                      <span className="text-muted-foreground">{time(t.created_at)}</span>
                    </div>
                    {t.customer_name && <p className="text-muted-foreground">Account: {t.customer_name}</p>}
                    {t.recorded_by_name && <p className="text-muted-foreground text-[10px]">By: {t.recorded_by_name}</p>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Items Sold ── */}
          {report.items_sold.length > 0 && (
            <CollapsibleSection
              title={`Items Sold (${report.items_sold.length} unique)`}
              expanded={expandedSections.items}
              onToggle={() => toggleSection("items")}
            >
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1">
                  <span>Item</span>
                  <span>Qty · Revenue</span>
                </div>
                {report.items_sold.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                    <span className="text-ink">{item.name}</span>
                    <span className="text-muted-foreground">
                      {item.quantity}× · {fmt(item.total_revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Orders Detail ── */}
          {report.orders.length > 0 && (
            <CollapsibleSection
              title={`All Orders (${report.orders.length})`}
              expanded={expandedSections.orders}
              onToggle={() => toggleSection("orders")}
            >
              <div className="space-y-1.5">
                {report.orders.map((o) => (
                  <div key={o.id} className="rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{o.receipt_number ?? "—"}</span>
                        <span className={`font-medium ${statusColor[o.status] ?? "text-muted-foreground"}`}>
                          {o.status.toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-ink">{fmt(o.total_amount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-muted-foreground">
                        {o.is_walk_in ? (o.walk_in_name || "Walk-in") : "Registered"}
                        {o.order_type === "dine_in" && o.table_name_snapshot ? ` · ${o.table_name_snapshot}` : ""}
                        {o.order_type !== "dine_in" ? ` · ${o.order_type}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {methodLabel[o.payment_method ?? ""] ?? o.payment_method ?? "—"}
                        {o.discount_amount ? ` · -${fmt(o.discount_amount)}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-[10px] text-muted-foreground">
                      <span>{o.processed_by_name ?? "System"}</span>
                      <span>{time(o.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Footer ── */}
          <div className="border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
            Generated {new Date().toLocaleString("en-NP")} · Powered by Zentro
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-3 text-xs">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3 text-xs">
      <button
        onClick={onToggle}
        className="mb-2 flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-ink"
      >
        <span>{title}</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${valueColor ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

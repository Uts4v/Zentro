// routes/merchant.fiscal-report.tsx — Customizable fiscal year report with download
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { reportApi, type FiscalYearReportData } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Printer, Download, ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/merchant/fiscal-report")({
  head: () => ({ meta: [{ title: "Fiscal Report · Zentro" }] }),
  component: FiscalReportPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getYearOptions() {
  const now = new Date();
  const currentYear = now.getFullYear();
  return Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
}

function getDefaultRange() {
  const now = new Date();
  const year = now.getFullYear();
  // Default to current calendar year
  return {
    startMonth: 0, // January
    startYear: year,
    endMonth: 11, // December
    endYear: year,
  };
}

function FiscalReportPage() {
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState(getDefaultRange);
  const [report, setReport] = useState<FiscalYearReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    monthly: true,
    items: false,
    staff: false,
  });

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const startDate = `${range.startYear}-${String(range.startMonth + 1).padStart(2, "0")}-01`;
  const endDate = `${range.endYear}-${String(range.endMonth + 1).padStart(2, "0")}-${new Date(range.endYear, range.endMonth + 1, 0).getDate()}`;

  function handleGenerate() {
    setLoading(true);
    setError(null);
    reportApi
      .getFiscalYearReport(startDate, endDate)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPNG() {
    if (!reportRef.current || !report) return;
    setDownloading(true);
    setError(null);
    try {
      const { domToPng } = await import("modern-screenshot");
      const dataUrl = await domToPng(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        timeout: 20000,
      });
      const link = document.createElement("a");
      link.download = `fiscal-report-${startDate}-to-${endDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
      setError(`Download failed: ${e instanceof Error ? e.message : "Unknown error"}. Use Print button instead.`);
    } finally {
      setDownloading(false);
    }
  }

  function handleDownloadCSV() {
    if (!report) return;

    const dateStr = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const csvEscape = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;

    const rows: string[] = [];

    // ── Header row ──
    rows.push("BillNo,Item,Quantity,Rate,SubTotal,OrderTotal,Discount,GrandTotal,PayMode,CashAmt,FonepayAmt,Date,OrderType,CustomerType,Room,Table,Staff");

    // ── Detail rows (one per item) ──
    report.order_details.forEach((r) => {
      rows.push([
        csvEscape(r.bill_no ?? ""),
        csvEscape(r.item_name),
        r.quantity,
        r.price,
        r.subtotal,
        r.order_total,
        r.discount,
        r.grand_total,
        r.payment_method,
        r.cash_amount,
        r.fonepay_amount,
        dateStr(r.date),
        r.order_type,
        r.customer_type,
        csvEscape(r.room_name ?? ""),
        csvEscape(r.table_name ?? ""),
        csvEscape(r.staff ?? ""),
      ].join(","));
    });

    // ── Summary rows ──
    rows.push("");
    rows.push("--- SUMMARY ---");
    rows.push(`Total Revenue,,${report.totals.total_sales}`);
    rows.push(`Total Orders,,${report.totals.total_orders}`);
    rows.push(`Total Items Sold,,${report.totals.total_items_sold}`);
    rows.push(`Avg Order Value,,${report.totals.total_orders > 0 ? (report.totals.total_sales / report.totals.total_orders).toFixed(2) : 0}`);
    rows.push(`Cash Sales,,${report.totals.cash_sales}`);
    rows.push(`FonePay Sales,,${report.totals.fonepay_sales}`);
    rows.push(`Credit Sales,,${report.totals.credit_sales}`);
    rows.push(`Split Sales,,${report.totals.split_sales}`);
    rows.push(`Total Discount,,${report.totals.total_discount}`);
    rows.push(`Cancelled Orders,,${report.totals.cancelled_orders}`);
    rows.push(`Cancelled Total,,${report.totals.cancelled_total}`);
    rows.push("");
    rows.push("--- ORDER TYPE BREAKDOWN ---");
    rows.push(`Dine-in,,${report.totals.dine_in_orders} orders,,${report.totals.dine_in_sales}`);
    rows.push(`Pickup,,${report.totals.pickup_orders} orders,,${report.totals.pickup_sales}`);
    if (report.totals.delivery_orders > 0)
      rows.push(`Delivery,,${report.totals.delivery_orders} orders,,${report.totals.delivery_sales}`);
    rows.push("");
    rows.push("--- CUSTOMER TYPE ---");
    rows.push(`Walk-in,,${report.totals.walk_in_orders} orders,,${report.totals.walk_in_sales}`);
    rows.push(`Registered,,${report.totals.registered_orders} orders,,${report.totals.registered_sales}`);
    rows.push("");
    rows.push("--- MONTHLY BREAKDOWN ---");
    rows.push("Month,Revenue,Orders,Items");
    report.monthly_breakdown.forEach((m) => {
      rows.push(`${m.month},${m.revenue},${m.orders},${m.items}`);
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `fiscal-report-${startDate}-to-${endDate}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) => `NPR ${n.toLocaleString()}`;
  const monthLabel = (m: string) => {
    const [year, month] = m.split("-");
    return `${MONTHS[parseInt(month, 10) - 1]} ${year}`;
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
        {report && (
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist">
              <Printer className="h-3 w-3" />
              Print
            </button>
            <button onClick={handleDownloadPNG} disabled={downloading}
              className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PNG
            </button>
            <button onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        )}
      </div>

      {/* Date range picker */}
      <div className="no-print glass rounded-2xl p-4">
        <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">Select Period</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">From</span>
            <div className="mt-1.5 flex gap-2">
              <select value={range.startMonth} onChange={(e) => setRange((p) => ({ ...p, startMonth: parseInt(e.target.value) }))}
                className="h-11 rounded-2xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={range.startYear} onChange={(e) => setRange((p) => ({ ...p, startYear: parseInt(e.target.value) }))}
                className="h-11 w-24 rounded-2xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
                {getYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">To</span>
            <div className="mt-1.5 flex gap-2">
              <select value={range.endMonth} onChange={(e) => setRange((p) => ({ ...p, endMonth: parseInt(e.target.value) }))}
                className="h-11 rounded-2xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={range.endYear} onChange={(e) => setRange((p) => ({ ...p, endYear: parseInt(e.target.value) }))}
                className="h-11 w-24 rounded-2xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
                {getYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </label>
          <button onClick={handleGenerate} disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate Report
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="receipt glass rounded-2xl p-6 space-y-0">
          {/* ── Header ── */}
          <div className="border-b border-border pb-3 text-center">
            <h2 className="font-display text-xl text-ink">Fiscal Report</h2>
            {report.merchant_address && <p className="text-[10px] text-muted-foreground">{report.merchant_address}</p>}
            {report.merchant_phone && <p className="text-[10px] text-muted-foreground">Tel: {report.merchant_phone}</p>}
            <p className="mt-2 text-sm font-semibold text-ink">
              FISCAL REPORT
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(report.start_date + "T12:00:00").toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" })}
              {" — "}
              {new Date(report.end_date + "T12:00:00").toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* ── KPIs ── */}
          <Section title="Summary">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Total Revenue" value={fmt(report.totals.total_sales)} />
              <KpiCard label="Total Orders" value={String(report.totals.total_orders)} />
              <KpiCard label="Items Sold" value={String(report.totals.total_items_sold)} />
              <KpiCard label="Avg Order Value" value={report.totals.total_orders > 0 ? fmt(Math.round(report.totals.total_sales / report.totals.total_orders)) : "NPR 0"} />
            </div>
          </Section>

          {/* ── Payment Breakdown ── */}
          <Section title="Payment Methods">
            <div className="space-y-1">
              <Row label="Cash sales" value={fmt(report.totals.cash_sales)} />
              <Row label="FonePay sales" value={fmt(report.totals.fonepay_sales)} />
              <Row label="Credit sales" value={fmt(report.totals.credit_sales)} />
              <Row label="Split sales" value={fmt(report.totals.split_sales)} />
              {report.totals.total_discount > 0 && (
                <Row label="Discounts given" value={`-${fmt(report.totals.total_discount)}`} valueColor="text-emerald-600" />
              )}
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

          {/* ── Credit Activity ── */}
          {(report.totals.credit_charges > 0 || report.totals.credit_payments > 0) && (
            <Section title="Credit Summary">
              <div className="space-y-1">
                <Row label="Total credit charges" value={fmt(report.totals.credit_charges)} />
                <Row label="Total credit payments" value={fmt(report.totals.credit_payments)} valueColor="text-emerald-600" />
              </div>
            </Section>
          )}

          {/* ── Monthly Breakdown ── */}
          {report.monthly_breakdown.length > 0 && (
            <CollapsibleSection
              title={`Monthly Breakdown (${report.monthly_breakdown.length} months)`}
              expanded={expandedSections.monthly}
              onToggle={() => toggleSection("monthly")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-1 pr-2">Month</th>
                      <th className="pb-1 pr-2 text-right">Revenue</th>
                      <th className="pb-1 pr-2 text-right">Orders</th>
                      <th className="pb-1 text-right">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly_breakdown.map((m) => (
                      <tr key={m.month} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 font-medium text-ink">{monthLabel(m.month)}</td>
                        <td className="py-1.5 pr-2 text-right text-muted-foreground">{fmt(m.revenue)}</td>
                        <td className="py-1.5 pr-2 text-right text-muted-foreground">{m.orders}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{m.items}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-medium text-ink">
                      <td className="pt-1.5 pr-2">Total</td>
                      <td className="pt-1.5 pr-2 text-right">{fmt(report.totals.total_sales)}</td>
                      <td className="pt-1.5 pr-2 text-right">{report.totals.total_orders}</td>
                      <td className="pt-1.5 text-right">{report.totals.total_items_sold}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CollapsibleSection>
          )}

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

          {/* ── Items Sold ── */}
          {report.items_sold.length > 0 && (
            <CollapsibleSection
              title={`Top Items (${report.items_sold.length} unique)`}
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg text-ink">{value}</p>
    </div>
  );
}

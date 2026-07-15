// routes/merchant.daily-report.tsx — End-of-day report with print/download
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { reportApi, type DailyReportData } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Printer, Download, Calendar } from "lucide-react";

export const Route = createFileRoute("/merchant/daily-report")({
  head: () => ({ meta: [{ title: "Daily Report · Zentro" }] }),
  component: DailyReportPage,
});

function DailyReportPage() {
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `daily-report-${report.date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {} finally {
      setDownloading(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
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
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download PNG
          </button>
        </div>
      </div>

      {/* Date picker */}
      <div className="no-print glass rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => changeDate(-1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist"
          >
            ‹
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-ink">
              {new Date(date + "T12:00:00").toLocaleDateString("en-NP", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={() => changeDate(1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist"
          >
            ›
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="receipt glass rounded-2xl p-6">
          {/* Header */}
          <div className="border-b border-border pb-3 text-center">
            <h2 className="font-display text-xl text-ink">{report.merchant_name}</h2>
            {report.merchant_address && (
              <p className="text-[10px] text-muted-foreground">{report.merchant_address}</p>
            )}
            {report.merchant_phone && (
              <p className="text-[10px] text-muted-foreground">Tel: {report.merchant_phone}</p>
            )}
            <p className="mt-2 text-sm font-semibold text-ink">
              DAILY REPORT — {new Date(date + "T12:00:00").toLocaleDateString("en-NP", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>

          {/* Shifts overview */}
          <div className="border-b border-border py-3 text-xs">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Shifts</p>
            {report.shifts.length === 0 ? (
              <p className="text-muted-foreground">No shifts recorded</p>
            ) : (
              <div className="space-y-2">
                {report.shifts.map((s) => {
                  const openedAt = new Date(s.opened_at);
                  const closedAt = s.closed_at ? new Date(s.closed_at) : null;
                  return (
                    <div key={s.id} className="rounded-xl bg-white/60 p-2.5">
                      <div className="flex justify-between">
                        <span className="font-medium text-ink">
                          {s.worker_name || s.opener_name}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            s.status === "open" ? "text-emerald-600" : "text-muted-foreground"
                          }`}
                        >
                          {s.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>
                          {openedAt.toLocaleTimeString("en-NP", { hour: "2-digit", minute: "2-digit" })}
                          {closedAt
                            ? ` — ${closedAt.toLocaleTimeString("en-NP", { hour: "2-digit", minute: "2-digit" })}`
                            : " — open"}
                        </span>
                        <span>
                          Cash: NPR {s.opening_cash.toLocaleString()}
                          {s.closing_cash_actual != null
                            ? ` → NPR ${s.closing_cash_actual.toLocaleString()}`
                            : ""}
                        </span>
                      </div>
                      {s.cash_difference != null && (
                        <div
                          className={`mt-0.5 text-[10px] ${
                            s.cash_difference < 0 ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          Diff: NPR {s.cash_difference.toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sales summary */}
          <div className="border-b border-border py-3 text-xs">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Sales Summary</p>
            <div className="space-y-1">
              <Row label="Total orders" value={String(report.totals.total_orders)} bold />
              <Row label="Cash sales" value={`NPR ${report.totals.cash_sales.toLocaleString()}`} />
              <Row label="Fonepay sales" value={`NPR ${report.totals.fonepay_sales.toLocaleString()}`} />
              <Row label="Credit sales" value={`NPR ${report.totals.credit_sales.toLocaleString()}`} />
              <Row label="Split sales" value={`NPR ${report.totals.split_sales.toLocaleString()}`} />
              {report.totals.total_discount > 0 && (
                <Row
                  label="Total discounts"
                  value={`-NPR ${report.totals.total_discount.toLocaleString()}`}
                  valueColor="text-emerald-600"
                />
              )}
              <div className="border-t border-border pt-1 mt-1">
                <Row label="Total revenue" value={`NPR ${report.totals.total_sales.toLocaleString()}`} bold />
              </div>
            </div>
          </div>

          {/* Cash summary */}
          <div className="py-3 text-xs">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Cash Summary</p>
            <div className="space-y-1">
              <Row label="Opening cash" value={`NPR ${report.totals.opening_cash.toLocaleString()}`} />
              <Row label="Cash drops" value={`+NPR ${report.totals.cash_drops.toLocaleString()}`} />
              <Row label="Cash payouts" value={`-NPR ${report.totals.cash_payouts.toLocaleString()}`} />
              {report.totals.closing_cash > 0 && (
                <Row label="Closing cash" value={`NPR ${report.totals.closing_cash.toLocaleString()}`} />
              )}
              {report.totals.cash_difference !== 0 && (
                <div className="border-t border-border pt-1 mt-1">
                  <Row
                    label="Total difference"
                    value={`NPR ${report.totals.cash_difference.toLocaleString()}`}
                    bold
                    valueColor={report.totals.cash_difference < 0 ? "text-rose-600" : "text-emerald-600"}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
            Generated {new Date().toLocaleString("en-NP")} · Powered by Zentro
          </div>
        </div>
      )}
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

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, Trash2, QrCode, Download, RefreshCw,
  Copy, X, Printer, Check,
} from "lucide-react";
import { tableApi, merchantApi, type MerchantTable, type MerchantProfile } from "@/lib/api";
import QRCode from "qrcode";

export const Route = createFileRoute("/merchant/tables")({
  head: () => ({ meta: [{ title: "Tables \u00b7 Merchant" }] }),
  component: MerchantTables,
});

function MerchantTables() {
  if (typeof window === "undefined") return null;

  const [tables, setTables] = useState<MerchantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<MerchantProfile | null>(null);

  const [bulkCount, setBulkCount] = useState(20);
  const [bulkPrefix, setBulkPrefix] = useState("Table");
  const [generating, setGenerating] = useState(false);

  const [customName, setCustomName] = useState("");
  const [customNumber, setCustomNumber] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const [qrTable, setQrTable] = useState<MerchantTable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [tableData, merchantData] = await Promise.all([
        tableApi.list(),
        merchantApi.me(),
      ]);
      setTables(tableData);
      setProfile(merchantData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBulkGenerate() {
    if (bulkCount < 1 || bulkCount > 100) return;
    setGenerating(true);
    setError("");
    try {
      const newTables = await tableApi.bulkGenerate(bulkCount, bulkPrefix);
      setTables((prev) => [...prev, ...newTables].sort((a, b) => a.table_number - b.table_number));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddCustom() {
    const num = parseInt(customNumber, 10);
    if (!customName.trim() || isNaN(num)) return;
    setAddingCustom(true);
    setError("");
    try {
      const t = await tableApi.create(customName.trim(), num);
      setTables((prev) => [...prev, t].sort((a, b) => a.table_number - b.table_number));
      setCustomName("");
      setCustomNumber("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingCustom(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this table? The QR code will stop working.")) return;
    try {
      await tableApi.delete(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleToggleActive(id: string, current: boolean) {
    try {
      const updated = await tableApi.setActive(id, !current);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRegenerateToken(id: string) {
    if (!confirm("Regenerate QR? The old QR code will stop working.")) return;
    try {
      const updated = await tableApi.regenerateToken(id);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (qrTable?.id === id) {
        setQrTable(updated);
        setQrDataUrl(null);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      const updated = await tableApi.update(id, renameValue.trim());
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setRenamingId(null);
      setRenameValue("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  function getTableUrl(table: MerchantTable) {
    const slug = profile?.store_slug ?? "";
    return window.location.origin + "/m/" + slug + "/table/" + table.public_token;
  }

  async function showQR(table: MerchantTable) {
    setQrTable(table);
    setQrDataUrl(null);
    try {
      const url = getTableUrl(table);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#1a1a1a", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error("QR generation failed:", e);
    }
  }

  function downloadQR() {
    if (!qrDataUrl || !qrTable) return;
    const link = document.createElement("a");
    link.download = qrTable.name.replace(/\s+/g, "_") + "_QR.png";
    link.href = qrDataUrl;
    link.click();
  }

  function printQR() {
    if (!qrDataUrl || !qrTable || !profile) return;
    const pw = window.open("", "_blank");
    if (!pw) return;
    const parts = [
      "<!DOCTYPE html><html><head><title>",
      qrTable.name,
      " QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}",
      ".card{max-width:320px;margin:0 auto;border:2px solid #e5e7eb;border-radius:16px;padding:32px 24px}",
      ".store-name{font-size:22px;font-weight:700;margin-bottom:4px}",
      ".table-name{font-size:18px;color:#6b7280;margin-bottom:16px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:8px 0}",
      ".qr{width:220px;height:220px;margin:0 auto 16px}.qr img{width:100%;height:100%}",
      ".scan-text{font-size:13px;color:#9ca3af}.powered{font-size:10px;color:#d1d5db;margin-top:12px}",
      "@media print{body{padding:20px}}</style></head><body>",
      '<div class="card">',
      '<div class="store-name">',
      profile.store_name,
      "</div>",
      '<div class="table-name">',
      qrTable.name,
      "</div>",
      '<div class="qr"><img src="',
      qrDataUrl,
      '" alt="QR" /></div>',
      '<div class="scan-text">Scan to view menu &amp; order</div>',
      '<div class="powered">Powered by Zentro</div>',
      "</div></body></html>",
    ];
    pw.document.write(parts.join(""));
    pw.document.close();
    pw.print();
  }

  function copyUrl(table: MerchantTable) {
    navigator.clipboard.writeText(getTableUrl(table));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function cardClassName(active: boolean) {
    if (active) return "rounded-2xl border border-border bg-white p-4 transition-all";
    return "rounded-2xl border border-border bg-mist/50 p-4 transition-all opacity-60";
  }

  function activeBadgeClasses(active: boolean) {
    if (active) return "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium bg-emerald-100 text-emerald-700";
    return "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium bg-mist text-muted-foreground";
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Table ordering</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Tables</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Manage tables, generate QR codes, and enable table ordering for your store.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-2xl text-ink">Bulk generate</h2>
        <p className="mt-1 text-sm text-muted-foreground">Quickly create multiple tables with sequential numbering.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Count</span>
            <input type="number" min={1} max={100} value={bulkCount}
              onChange={(e) => setBulkCount(parseInt(e.target.value) || 20)}
              className="mt-1.5 h-11 w-24 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Prefix</span>
            <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="Table"
              className="mt-1.5 h-11 w-40 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <button onClick={handleBulkGenerate} disabled={generating || bulkCount < 1}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Creates {bulkPrefix} 1 through {bulkPrefix} {bulkCount}. Skips numbers that already exist.
        </p>
      </section>

      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-2xl text-ink">Add custom table</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add named tables like Patio A, VIP Lounge, or Room 301.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Name</span>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Patio A"
              className="mt-1.5 h-11 w-48 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Number</span>
            <input type="number" value={customNumber} onChange={(e) => setCustomNumber(e.target.value)} placeholder="e.g. 101"
              className="mt-1.5 h-11 w-28 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <button onClick={handleAddCustom} disabled={addingCustom || !customName.trim() || !customNumber}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add table
          </button>
        </div>
      </section>

      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">Your tables</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tables.length} table{tables.length !== 1 ? "s" : ""} &middot; {tables.filter((t) => t.is_active).length} active
            </p>
          </div>
        </div>

        {tables.length === 0 ? (
          <div className="mt-8 rounded-2xl py-12 text-center">
            <p className="text-4xl">&#x1FA91;</p>
            <p className="mt-3 font-display text-lg text-ink">No tables yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Generate tables above to get started</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <div key={t.id} className={cardClassName(t.is_active)}>
                {renamingId === t.id ? (
                  <div className="flex items-center gap-2">
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(t.id); }}
                      className="h-9 flex-1 rounded-xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" autoFocus />
                    <button onClick={() => handleRename(t.id)}
                      className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setRenamingId(null); setRenameValue(""); }}
                      className="grid h-8 w-8 place-items-center rounded-full bg-mist text-muted-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-display text-lg text-ink">{t.name}</p>
                        <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">{t.public_token}</p>
                      </div>
                      <button onClick={() => handleToggleActive(t.id, t.is_active)}
                        className={activeBadgeClasses(t.is_active)}>
                        {t.is_active ? "Active" : "Disabled"}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button onClick={() => showQR(t)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
                        <QrCode className="h-3 w-3" /> QR
                      </button>
                      <button onClick={() => copyUrl(t)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      <button onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
                        Rename
                      </button>
                      <button onClick={() => handleRegenerateToken(t.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-amber-600 hover:bg-amber-50">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleDelete(t.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-[11px] font-medium text-rose-600 hover:bg-rose-50">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQrTable(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-ink">{qrTable.name}</h3>
              <button onClick={() => setQrTable(null)} className="grid h-8 w-8 place-items-center rounded-full bg-mist text-muted-foreground hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{profile?.store_name}</p>
            <div className="mt-4 flex justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" className="w-64 rounded-2xl" />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-mist">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Scan to order</p>
            <div className="mt-4 flex gap-2">
              <button onClick={downloadQR} disabled={!qrDataUrl}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-primary-foreground disabled:opacity-50">
                <Download className="h-4 w-4" /> Download
              </button>
              <button onClick={printQR} disabled={!qrDataUrl}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-medium text-ink disabled:opacity-50">
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, Trash2, QrCode, Download, RefreshCw,
  Copy, X, Printer, Check, ChevronDown, ChevronRight,
  DoorOpen, Pencil,
} from "lucide-react";
import { tableApi, roomApi, merchantApi, type MerchantTable, type MerchantRoom, type MerchantProfile } from "@/lib/api";
import QRCode from "qrcode";

export const Route = createFileRoute("/merchant/tables")({
  head: () => ({ meta: [{ title: "Tables · Merchant" }] }),
  component: MerchantTables,
});

function MerchantTables() {
  const [tables, setTables] = useState<MerchantTable[]>([]);
  const [rooms, setRooms] = useState<MerchantRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<MerchantProfile | null>(null);

  // Room form
  const [roomName, setRoomName] = useState("");
  const [roomDesc, setRoomDesc] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [editRoomDesc, setEditRoomDesc] = useState("");

  // Table forms
  const [bulkCount, setBulkCount] = useState(20);
  const [bulkPrefix, setBulkPrefix] = useState("Table");
  const [generating, setGenerating] = useState(false);
  const [bulkRoomId, setBulkRoomId] = useState<string>("");

  const [customName, setCustomName] = useState("");
  const [customNumber, setCustomNumber] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customRoomId, setCustomRoomId] = useState<string>("");

  const [qrTable, setQrTable] = useState<MerchantTable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Expanded rooms tracking
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const [expandedUnassigned, setExpandedUnassigned] = useState(true);

  const toggleRoom = (id: string) =>
    setExpandedRooms((prev) => ({ ...prev, [id]: !prev[id] }));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [tableData, roomData, merchantData] = await Promise.all([
        tableApi.list(),
        roomApi.list(),
        merchantApi.me(),
      ]);
      setTables(tableData);
      setRooms(roomData);
      setProfile(merchantData);
      // Auto-expand all rooms
      const expanded: Record<string, boolean> = {};
      roomData.forEach((r) => { expanded[r.id] = true; });
      setExpandedRooms(expanded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Room CRUD ────────────────────────────────────────────────────────────

  async function handleAddRoom() {
    if (!roomName.trim()) return;
    setAddingRoom(true);
    setError("");
    try {
      const room = await roomApi.create(roomName.trim(), roomDesc.trim());
      setRooms((prev) => [...prev, room]);
      setExpandedRooms((prev) => ({ ...prev, [room.id]: true }));
      setRoomName("");
      setRoomDesc("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingRoom(false);
    }
  }

  async function handleUpdateRoom(id: string) {
    if (!editRoomName.trim()) return;
    try {
      const updated = await roomApi.update(id, { name: editRoomName.trim(), description: editRoomDesc.trim() });
      setRooms((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingRoomId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleDeleteRoom(id: string) {
    if (!confirm("Delete this room? Tables in this room will become unassigned.")) return;
    try {
      await roomApi.delete(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      setTables((prev) => prev.map((t) => (t.room_id === id ? { ...t, room_id: null } : t)));
      setExpandedRooms((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleToggleRoomActive(id: string, current: boolean) {
    try {
      const updated = await roomApi.update(id, { is_active: !current });
      setRooms((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── Table CRUD ───────────────────────────────────────────────────────────

  async function handleBulkGenerate(targetRoomId?: string | null) {
    if (bulkCount < 1 || bulkCount > 100) return;
    setGenerating(true);
    setError("");
    try {
      const rid = targetRoomId ?? (bulkRoomId || null);
      const newTables = await tableApi.bulkGenerate(bulkCount, bulkPrefix, rid);
      setTables((prev) => [...prev, ...newTables].sort((a, b) => a.table_number - b.table_number));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddCustom(targetRoomId?: string | null) {
    const num = parseInt(customNumber, 10);
    if (!customName.trim() || isNaN(num)) return;
    setAddingCustom(true);
    setError("");
    try {
      const rid = targetRoomId ?? (customRoomId || null);
      const t = await tableApi.create(customName.trim(), num, rid);
      setTables((prev) => [...prev, t].sort((a, b) => a.table_number - b.table_number));
      setCustomName("");
      setCustomNumber("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingCustom(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this table? The QR code will stop working.")) return;
    try {
      await tableApi.delete(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleToggleActive(id: string, current: boolean) {
    try {
      const updated = await tableApi.setActive(id, !current);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleRegenerateToken(id: string) {
    if (!confirm("Regenerate QR? The old QR code will stop working.")) return;
    try {
      const updated = await tableApi.regenerateToken(id);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (qrTable?.id === id) { setQrTable(updated); setQrDataUrl(null); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      const updated = await tableApi.update(id, renameValue.trim());
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setRenamingId(null);
      setRenameValue("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleMoveTable(tableId: string, newRoomId: string | null) {
    try {
      const updated = await tableApi.setRoom(tableId, newRoomId);
      setTables((prev) => prev.map((t) => (t.id === tableId ? updated : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── QR helpers ───────────────────────────────────────────────────────────

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
        width: 400, margin: 2,
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
    pw.document.write(`<!DOCTYPE html><html><head><title>${qrTable.name} QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}.card{max-width:320px;margin:0 auto;border:2px solid #e5e7eb;border-radius:16px;padding:32px 24px}.store-name{font-size:22px;font-weight:700;margin-bottom:4px}.table-name{font-size:18px;color:#6b7280;margin-bottom:16px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:8px 0}.qr{width:220px;height:220px;margin:0 auto 16px}.qr img{width:100%;height:100%}.scan-text{font-size:13px;color:#9ca3af}.powered{font-size:10px;color:#d1d5db;margin-top:12px}@media print{body{padding:20px}}</style></head><body><div class="card"><div class="store-name">${profile.store_name}</div><div class="table-name">${qrTable.name}</div><div class="qr"><img src="${qrDataUrl}" alt="QR" /></div><div class="scan-text">Scan to view menu &amp; order</div><div class="powered">Powered by Zentro</div></div></body></html>`);
    pw.document.close();
    pw.print();
  }

  function copyUrl(table: MerchantTable) {
    navigator.clipboard.writeText(getTableUrl(table));
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const tablesByRoom = (roomId: string) => tables.filter((t) => t.room_id === roomId);
  const unassignedTables = tables.filter((t) => !t.room_id);
  const activeTableCount = tables.filter((t) => t.is_active).length;

  const fmt = (n: number) => `NPR ${n.toLocaleString()}`;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Table ordering</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Tables</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Manage rooms and tables, generate QR codes, and enable table ordering for your store.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ── Add Room ── */}
      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-2xl text-ink">Add Room</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create a room to group tables together (e.g., Floor 1, VIP Lounge, Patio).</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Room Name</span>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Floor 1"
              className="mt-1.5 h-11 w-48 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Description (optional)</span>
            <input value={roomDesc} onChange={(e) => setRoomDesc(e.target.value)} placeholder="e.g. Main dining area"
              className="mt-1.5 h-11 w-56 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" />
          </label>
          <button onClick={handleAddRoom} disabled={addingRoom || !roomName.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {addingRoom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Room
          </button>
        </div>
      </section>

      {/* ── Bulk Generate ── */}
      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-2xl text-ink">Bulk generate tables</h2>
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
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Room (optional)</span>
            <select value={bulkRoomId} onChange={(e) => setBulkRoomId(e.target.value)}
              className="mt-1.5 h-11 w-44 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <button onClick={() => handleBulkGenerate()} disabled={generating || bulkCount < 1}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Creates {bulkPrefix} 1 through {bulkPrefix} {bulkCount}. Skips numbers that already exist.
        </p>
      </section>

      {/* ── Add Custom Table ── */}
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
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Room (optional)</span>
            <select value={customRoomId} onChange={(e) => setCustomRoomId(e.target.value)}
              className="mt-1.5 h-11 w-44 rounded-2xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40">
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <button onClick={() => handleAddCustom()} disabled={addingCustom || !customName.trim() || !customNumber}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add table
          </button>
        </div>
      </section>

      {/* ── Rooms & Tables ── */}
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">Your tables</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tables.length} table{tables.length !== 1 ? "s" : ""} &middot; {activeTableCount} active &middot; {rooms.length} room{rooms.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {tables.length === 0 && rooms.length === 0 ? (
          <div className="mt-8 rounded-2xl py-12 text-center">
            <p className="text-4xl">🪑</p>
            <p className="mt-3 font-display text-lg text-ink">No tables yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create a room above, then generate tables</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* ── Rooms ── */}
            {rooms.map((room) => {
              const roomTables = tablesByRoom(room.id);
              const isExpanded = expandedRooms[room.id] ?? false;
              const isEditing = editingRoomId === room.id;
              return (
                <div key={room.id} className={`rounded-2xl border border-border transition-all ${room.is_active ? "bg-white" : "bg-mist/50 opacity-60"}`}>
                  {/* Room header */}
                  <button onClick={() => toggleRoom(room.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-mist/30 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                      <DoorOpen className="h-4 w-4 text-muted-foreground" />
                      {isEditing ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleUpdateRoom(room.id); }}
                            className="h-8 w-40 rounded-xl bg-mist px-3 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-ember/40" autoFocus />
                          <input value={editRoomDesc} onChange={(e) => setEditRoomDesc(e.target.value)} placeholder="Description"
                            className="h-8 w-48 rounded-xl bg-mist px-3 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-ember/40" />
                          <button onClick={() => handleUpdateRoom(room.id)}
                            className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setEditingRoomId(null)}
                            className="grid h-7 w-7 place-items-center rounded-full bg-mist text-muted-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span className="font-display text-lg text-ink">{room.name}</span>
                          {room.description && <span className="ml-2 text-xs text-muted-foreground">— {room.description}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{roomTables.length} table{roomTables.length !== 1 ? "s" : ""}</span>
                      {!isEditing && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleToggleRoomActive(room.id, room.is_active)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${room.is_active ? "bg-emerald-100 text-emerald-700" : "bg-mist text-muted-foreground"}`}>
                            {room.is_active ? "Active" : "Off"}
                          </button>
                          <button onClick={() => { setEditingRoomId(room.id); setEditRoomName(room.name); setEditRoomDesc(room.description); }}
                            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-mist hover:text-ink">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDeleteRoom(room.id)}
                            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Room body */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      {/* Room-level quick add */}
                      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-mist/50 p-3">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Quick add to {room.name}:</span>
                        <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Table name"
                          className="h-9 w-32 rounded-xl bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40" />
                        <input type="number" value={customNumber} onChange={(e) => setCustomNumber(e.target.value)} placeholder="No."
                          className="h-9 w-20 rounded-xl bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40" />
                        <button onClick={() => handleAddCustom(room.id)} disabled={addingCustom || !customName.trim() || !customNumber}
                          className="inline-flex h-9 items-center gap-1 rounded-xl bg-ink px-3 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
                          <Plus className="h-3 w-3" /> Add
                        </button>
                        <div className="h-5 w-px bg-border mx-1" />
                        <input type="number" min={1} max={100} value={bulkCount} onChange={(e) => setBulkCount(parseInt(e.target.value) || 5)}
                          className="h-9 w-16 rounded-xl bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40" />
                        <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="Prefix"
                          className="h-9 w-24 rounded-xl bg-white px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40" />
                        <button onClick={() => handleBulkGenerate(room.id)} disabled={generating}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist disabled:opacity-50">
                          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Bulk
                        </button>
                      </div>

                      {/* Tables grid */}
                      {roomTables.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">No tables in this room yet</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {roomTables.map((t) => (
                            <TableCard key={t.id} table={t} profile={profile!} rooms={rooms}
                              renamingId={renamingId} renameValue={renameValue} setRenamingId={setRenamingId}
                              setRenameValue={setRenameValue} onShowQR={showQR} onCopyUrl={copyUrl}
                              onToggleActive={handleToggleActive} onRegenerateToken={handleRegenerateToken}
                              onRename={handleRename} onDelete={handleDelete} onMoveTable={handleMoveTable} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Unassigned Tables ── */}
            {unassignedTables.length > 0 && (
              <div className="rounded-2xl border border-border bg-white">
                <button onClick={() => setExpandedUnassigned((p) => !p)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-mist/30 rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg text-ink">Unassigned Tables</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{unassignedTables.length} table{unassignedTables.length !== 1 ? "s" : ""}</span>
                    {expandedUnassigned ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedUnassigned && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {unassignedTables.map((t) => (
                        <TableCard key={t.id} table={t} profile={profile!} rooms={rooms}
                          renamingId={renamingId} renameValue={renameValue} setRenamingId={setRenamingId}
                          setRenameValue={setRenameValue} onShowQR={showQR} onCopyUrl={copyUrl}
                          onToggleActive={handleToggleActive} onRegenerateToken={handleRegenerateToken}
                          onRename={handleRename} onDelete={handleDelete} onMoveTable={handleMoveTable} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── QR Modal ── */}
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

// ── Table Card Component ──────────────────────────────────────────────────────

function TableCard({
  table, profile, rooms,
  renamingId, renameValue, setRenamingId, setRenameValue,
  onShowQR, onCopyUrl, onToggleActive, onRegenerateToken, onRename, onDelete, onMoveTable,
}: {
  table: MerchantTable;
  profile: MerchantProfile;
  rooms: MerchantRoom[];
  renamingId: string | null;
  renameValue: string;
  setRenamingId: (id: string | null) => void;
  setRenameValue: (v: string) => void;
  onShowQR: (t: MerchantTable) => void;
  onCopyUrl: (t: MerchantTable) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onRegenerateToken: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveTable: (id: string, roomId: string | null) => void;
}) {
  const isRenaming = renamingId === table.id;

  function cardClassName(active: boolean) {
    if (active) return "rounded-2xl border border-border bg-white p-4 transition-all";
    return "rounded-2xl border border-border bg-mist/50 p-4 transition-all opacity-60";
  }

  return (
    <div className={cardClassName(table.is_active)}>
      {isRenaming ? (
        <div className="flex items-center gap-2">
          <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onRename(table.id); }}
            className="h-9 flex-1 rounded-xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40" autoFocus />
          <button onClick={() => onRename(table.id)}
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
              <p className="font-display text-lg text-ink">{table.name}</p>
              <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">{table.public_token}</p>
            </div>
            <button onClick={() => onToggleActive(table.id, table.is_active)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${table.is_active ? "bg-emerald-100 text-emerald-700" : "bg-mist text-muted-foreground"}`}>
              {table.is_active ? "Active" : "Disabled"}
            </button>
          </div>

          {/* Room assignment dropdown */}
          <div className="mt-2">
            <select value={table.room_id ?? ""} onChange={(e) => onMoveTable(table.id, e.target.value || null)}
              className="w-full rounded-xl border border-border bg-mist px-2.5 py-1.5 text-[11px] text-ink outline-none focus:ring-2 focus:ring-ember/40">
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button onClick={() => onShowQR(table)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
              <QrCode className="h-3 w-3" /> QR
            </button>
            <button onClick={() => onCopyUrl(table)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button onClick={() => { setRenamingId(table.id); setRenameValue(table.name); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-ink hover:bg-mist">
              Rename
            </button>
            <button onClick={() => onRegenerateToken(table.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-[11px] font-medium text-amber-600 hover:bg-amber-50">
              <RefreshCw className="h-3 w-3" />
            </button>
            <button onClick={() => onDelete(table.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-[11px] font-medium text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

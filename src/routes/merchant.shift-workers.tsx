// routes/merchant.shift-workers.tsx — Manage shift workers (name + PIN)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Loader2, ArrowLeft, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

export const Route = createFileRoute("/merchant/shift-workers")({
  head: () => ({ meta: [{ title: "Shift Workers · Merchant" }] }),
  component: ShiftWorkersPage,
});

interface ShiftWorker {
  id: string;
  name: string;
  pin: string;
  is_active: boolean;
  created_at: string;
}

function ShiftWorkersPage() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();

  const [workers, setWorkers] = useState<ShiftWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    if (!merchantProfile) return;
    try {
      const { data, error } = await supabase
        .from("shift_workers")
        .select("*")
        .eq("merchant_id", merchantProfile.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setWorkers((data ?? []) as ShiftWorker[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [merchantProfile]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  async function handleAdd() {
    if (!merchantProfile || !newName.trim() || !newPin.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from("shift_workers").insert({
        merchant_id: merchantProfile.id,
        name: newName.trim(),
        pin: newPin.trim(),
      });
      if (insertErr) {
        if (insertErr.message.includes("unique")) {
          setError("A worker with this name already exists");
        } else {
          throw new Error(insertErr.message);
        }
        return;
      }
      setShowAdd(false);
      setNewName("");
      setNewPin("");
      await fetchWorkers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(worker: ShiftWorker) {
    if (!merchantProfile) return;
    const { error } = await supabase
      .from("shift_workers")
      .update({ is_active: !worker.is_active })
      .eq("id", worker.id);
    if (!error) await fetchWorkers();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this worker?")) return;
    const { error } = await supabase.from("shift_workers").delete().eq("id", id);
    if (!error) await fetchWorkers();
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
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Manage
          </p>
          <h1 className="font-display mt-1 text-5xl text-ink">Shift Workers</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Workers use name + PIN to log into the POS. No email needed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate({ to: "/merchant" })}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-mist px-4 text-xs font-medium text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-xs font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Worker
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-medium text-ink">Add Shift Worker</h3>
          <div className="mt-3 flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="h-10 flex-1 rounded-xl bg-mist px-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
            />
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="PIN (4-6 digits)"
              maxLength={8}
              className="h-10 w-32 rounded-xl bg-mist px-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !newName.trim() || !newPin.trim()}
              className="h-10 rounded-xl bg-ink px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(null); }}
              className="h-10 rounded-xl border border-border px-4 text-xs font-medium text-muted-foreground hover:bg-mist"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Worker list */}
      {workers.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-3xl">👤</p>
          <p className="mt-3 text-sm text-muted-foreground">
            No shift workers yet. Add workers so they can log into the POS.
          </p>
        </div>
      ) : (
        <div className="glass-strong rounded-3xl overflow-hidden">
          <div className="hidden grid-cols-[1fr_1fr_auto_auto] gap-4 border-b border-border px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground md:grid">
            <span>Name</span>
            <span>PIN</span>
            <span>Status</span>
            <span />
          </div>
          {workers.map((w) => (
            <div
              key={w.id}
              className="grid grid-cols-1 items-center gap-4 border-b border-border px-6 py-4 last:border-b-0 md:grid-cols-[1fr_1fr_auto_auto]"
            >
              <span className="text-sm font-medium text-ink">{w.name}</span>
              <span className="text-sm text-muted-foreground">{"•".repeat(w.pin.length)}</span>
              <button
                onClick={() => handleToggle(w)}
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  w.is_active ? "text-emerald-600" : "text-muted-foreground"
                }`}
              >
                {w.is_active ? (
                  <ToggleRight className="h-5 w-5" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
                {w.is_active ? "Active" : "Disabled"}
              </button>
              <button
                onClick={() => handleDelete(w.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

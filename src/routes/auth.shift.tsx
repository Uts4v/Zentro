// routes/auth.shift.tsx — Simple shift worker login (name + PIN)
// Requires merchant to be logged in to Supabase on this device first.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { setShiftWorker, getShiftWorker } from "@/lib/shift-worker";
import { Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth/shift")({
  head: () => ({ meta: [{ title: "Shift Login · Zentro" }] }),
  component: ShiftLoginPage,
});

interface Merchant {
  id: string;
  store_name: string;
}

function ShiftLoginPage() {
  const navigate = useNavigate();
  const { user, merchantProfile } = useAuth();

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in as shift worker
  useEffect(() => {
    const existing = getShiftWorker();
    if (existing) {
      navigate({ to: "/pos" as any, replace: true });
    }
  }, [navigate]);

  // If merchant is logged in, use their profile. Otherwise fetch all.
  useEffect(() => {
    (async () => {
      try {
        if (merchantProfile) {
          // Merchant is already logged in on this device
          setMerchants([{ id: merchantProfile.id, store_name: merchantProfile.store_name }]);
          setSelectedMerchant(merchantProfile.id);
        } else {
          // No merchant logged in — list all approved stores
          const { data } = await supabase
            .from("merchant_profiles")
            .select("id, store_name")
            .eq("is_approved", true)
            .order("store_name");
          setMerchants((data ?? []) as Merchant[]);
          if (data?.length === 1) {
            setSelectedMerchant(data[0].id);
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [merchantProfile]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMerchant || !name.trim() || !pin.trim()) {
      setError("Select store, enter name and PIN");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const { data, error: rpcErr } = await supabase.rpc("verify_shift_worker", {
        p_merchant_id: selectedMerchant,
        p_name: name.trim(),
        p_pin: pin.trim(),
      });

      if (rpcErr || !data) {
        setError(rpcErr?.message ?? "Invalid name or PIN");
        return;
      }

      const worker = data as { id: string; name: string };
      setShiftWorker({
        worker_id: worker.id,
        merchant_id: selectedMerchant,
        name: worker.name,
      });

      navigate({ to: "/pos" as any, replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="glass w-full max-w-sm rounded-3xl p-8">
        <button
          onClick={() => navigate({ to: "/auth" as any })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-ink">Shift Login</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your name and PIN to start your shift
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {merchants.length > 1 && (
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Store
              </label>
              <select
                value={selectedMerchant}
                onChange={(e) => setSelectedMerchant(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              >
                <option value="">Select store...</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.store_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {merchants.length === 1 && (
            <p className="text-sm font-medium text-ink">
              {merchants[0].store_name}
            </p>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ram"
              autoComplete="off"
              className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              maxLength={8}
              className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim() || !pin.trim()}
            className="grid h-12 w-full place-items-center rounded-xl bg-ink text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Start Working"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

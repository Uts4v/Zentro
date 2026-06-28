// routes/admin.index.tsx — Merchant approval queue
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Check, X, Clock, Store } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Merchant Approvals · Admin · Zentro" }] }),
  component: AdminMerchantApprovals,
});

type MerchantRow = {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string | null;
  address: string | null;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type FilterTab = "pending" | "approved" | "rejected" | "all";

function AdminMerchantApprovals() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("merchant_profiles")
      .select("id, user_id, store_name, store_slug, address, phone, status, created_at")
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setMerchants([]);
    } else {
      setMerchants((data ?? []) as MerchantRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    const { error: err } = await supabase
      .from("merchant_profiles")
      .update({ status })
      .eq("id", id);

    if (err) {
      setError(err.message);
    } else {
      setMerchants((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status } : m))
      );
    }
    setBusyId(null);
  }

  const filtered =
    tab === "all" ? merchants : merchants.filter((m) => m.status === tab);

  const counts = {
    pending: merchants.filter((m) => m.status === "pending").length,
    approved: merchants.filter((m) => m.status === "approved").length,
    rejected: merchants.filter((m) => m.status === "rejected").length,
    all: merchants.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Admin
        </p>
        <h1 className="font-display mt-2 text-4xl text-ink">
          Merchant approvals
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review new store applications before they go live to customers.
        </p>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected", "all"] as FilterTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-ink text-primary-foreground"
                : "bg-mist text-muted-foreground hover:text-ink"
            }`}
          >
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-mist/50 px-6 py-12 text-center text-sm text-muted-foreground">
          No {tab !== "all" ? tab : ""} merchant applications.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="glass-strong flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mist">
                  <Store className="h-5 w-5 text-ink" />
                </div>
                <div>
                  <p className="font-medium text-ink">{m.store_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.address || "No address on file"}
                    {m.phone ? ` · ${m.phone}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Applied {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                {m.status !== "approved" && (
                  <button
                    disabled={busyId === m.id}
                    onClick={() => setStatus(m.id, "approved")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {m.status !== "rejected" && (
                  <button
                    disabled={busyId === m.id}
                    onClick={() => setStatus(m.id, "rejected")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MerchantRow["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        <Check className="h-3 w-3" /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
        <X className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}
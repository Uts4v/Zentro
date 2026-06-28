import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Store, CheckCircle, XCircle, Clock } from "lucide-react";

type MerchantProfile = {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export const Route = createFileRoute("/admin/merchants")({
  component: AdminMerchants,
});

function AdminMerchants() {
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => { fetchMerchants(); }, []);

  async function fetchMerchants() {
    setLoading(true);

    const { data, error } = await supabase
      .from("merchant_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch merchants:", error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMerchants([]);
      setLoading(false);
      return;
    }

    const userIds = data.map((m) => m.user_id);
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profileMap = Object.fromEntries(
      (profilesData ?? []).map((p) => [p.id, p])
    );

    setMerchants(data.map((m) => ({ ...m, profiles: profileMap[m.user_id] ?? null })));
    setLoading(false);
  }

  async function updateStatus(id: string, status: "approved" | "rejected") {
    setActionBusy(id);
    const { error } = await supabase
      .from("merchant_profiles")
      .update({ status, is_approved: status === "approved" })
      .eq("id", id);

    if (error) {
      console.error("Failed to update status:", error);
    } else {
      setMerchants((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    }
    setActionBusy(null);
  }

  const filtered = merchants.filter((m) => filter === "all" ? true : m.status === filter);
  const counts = {
    all: merchants.length,
    pending: merchants.filter((m) => m.status === "pending").length,
    approved: merchants.filter((m) => m.status === "approved").length,
    rejected: merchants.filter((m) => m.status === "rejected").length,
  };

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
      <h1 className="font-display mt-2 text-4xl text-ink">Merchants</h1>
      <p className="mt-2 text-sm text-muted-foreground">Review and approve merchant applications.</p>

      <div className="mt-8 flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab ? "bg-ink text-primary-foreground" : "bg-mist text-muted-foreground hover:text-ink"
            }`}
          >
            {tab === "pending" && <Clock className="h-3.5 w-3.5" />}
            {tab === "approved" && <CheckCircle className="h-3.5 w-3.5" />}
            {tab === "rejected" && <XCircle className="h-3.5 w-3.5" />}
            {tab === "all" && <Store className="h-3.5 w-3.5" />}
            <span className="capitalize">{tab}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              filter === tab ? "bg-white/20 text-white" : "bg-border text-muted-foreground"
            }`}>
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} merchants found.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((merchant) => (
            <MerchantCard
              key={merchant.id}
              merchant={merchant}
              actionBusy={actionBusy}
              onApprove={() => updateStatus(merchant.id, "approved")}
              onReject={() => updateStatus(merchant.id, "rejected")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MerchantCard({
  merchant, actionBusy, onApprove, onReject,
}: {
  merchant: MerchantProfile;
  actionBusy: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const busy = actionBusy === merchant.id;

  const statusStyles = {
    pending:  "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };

  const statusIcons = {
    pending:  <Clock className="h-3 w-3" />,
    approved: <CheckCircle className="h-3 w-3" />,
    rejected: <XCircle className="h-3 w-3" />,
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-sm font-medium text-primary-foreground">
            {merchant.store_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{merchant.store_name}</p>
            <p className="text-xs text-muted-foreground">
              {merchant.profiles?.full_name ?? "Unknown owner"}
            </p>
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusStyles[merchant.status]}`}>
          {statusIcons[merchant.status]}
          {merchant.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        {merchant.business_type && (
          <div>
            <span className="block text-[10px] uppercase tracking-wider">Type</span>
            <span className="text-ink">{merchant.business_type}</span>
          </div>
        )}
        {merchant.address && (
          <div>
            <span className="block text-[10px] uppercase tracking-wider">Address</span>
            <span className="text-ink">{merchant.address}</span>
          </div>
        )}
        {merchant.phone && (
          <div>
            <span className="block text-[10px] uppercase tracking-wider">Phone</span>
            <span className="text-ink">{merchant.phone}</span>
          </div>
        )}
        <div>
          <span className="block text-[10px] uppercase tracking-wider">Applied</span>
          <span className="text-ink">
            {new Date(merchant.created_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        </div>
      </div>

      {merchant.status === "pending" && (
        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <button onClick={onApprove} disabled={busy}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" />Approve</>}
          </button>
          <button onClick={onReject} disabled={busy}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-600 transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" />Reject</>}
          </button>
        </div>
      )}

      {merchant.status === "approved" && (
        <div className="mt-4 flex border-t border-border pt-4">
          <button onClick={onReject} disabled={busy}
            className="flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-600 transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" />Revoke approval</>}
          </button>
        </div>
      )}

      {merchant.status === "rejected" && (
        <div className="mt-4 flex border-t border-border pt-4">
          <button onClick={onApprove} disabled={busy}
            className="flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" />Approve anyway</>}
          </button>
        </div>
      )}
    </div>
  );
}
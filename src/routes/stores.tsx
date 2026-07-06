import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell, TopBar } from "@/components/MobileShell";
import { Search, MapPin, Loader2, Clock } from "lucide-react";
import { requireAuth } from "@/lib/auth-guard";
import { merchantApi, type MerchantProfile } from "@/lib/api";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/stores")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Discover" }] }),
  component: Stores,
});

const GRADIENTS = [
  "from-orange-300 via-rose-200 to-pink-100",
  "from-emerald-300 via-teal-200 to-cyan-100",
  "from-violet-300 via-purple-200 to-indigo-100",
  "from-amber-300 via-yellow-200 to-orange-100",
  "from-sky-300 via-blue-200 to-indigo-100",
  "from-rose-300 via-pink-200 to-fuchsia-100",
];

function getEmoji(businessType?: string | null): string {
  const t = businessType?.toLowerCase() || "";
  if (t.includes("bakery") || t.includes("pastry")) return "🥐";
  if (t.includes("matcha") || t.includes("tea")) return "🍵";
  if (t.includes("roaster") || t.includes("coffee")) return "🫘";
  if (t.includes("bar")) return "🍹";
  if (t.includes("food") || t.includes("restaurant")) return "🍽️";
  return "☕";
}

function Stores() {
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await merchantApi.list();
      const list = Array.isArray(data) ? data : (data as any).results ?? [];
      setMerchants(list);
    } catch (e: any) {
      setError(e.message || "Failed to load stores");
    } finally {
      setLoading(false);
    }
  }

  const filtered = merchants.filter(
    (m) =>
      m.store_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.business_type ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const open = filtered.filter((m) => m.is_open);
  const closed = filtered.filter((m) => !m.is_open);

  return (
    <MobileShell>
      <TopBar />

      {/* Header */}
      <div className="px-5 pt-2">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Discover</p>
        <h1 className="font-display mt-1 text-4xl leading-tight text-ink">
          Find your next<br />favorite spot
        </h1>
      </div>

      {/* Search */}
      <div className="mt-5 px-5">
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-soft">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cafés, bakeries, tea bars…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground/70"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-muted-foreground hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-6 pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Finding stores near you…</p>
          </div>
        ) : error ? (
          <div className="mx-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
            <button onClick={load} className="ml-2 underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-5 glass rounded-3xl py-20 text-center">
            <p className="text-5xl">🏪</p>
            <p className="mt-4 font-display text-xl text-ink">
              {merchants.length === 0 ? "No stores yet" : "No matches"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {merchants.length === 0
                ? "Check back soon — stores are on their way."
                : `Nothing matched "${search}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-8 px-5">
            {/* Open stores */}
            {open.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Open now · {open.length}
                  </h2>
                </div>
                <div className="space-y-3">
                  {open.map((m, i) => (
                    <StoreCard key={m.id} merchant={m} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Closed stores */}
            {closed.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Closed · {closed.length}
                  </h2>
                </div>
                <div className="space-y-3 opacity-60">
                  {closed.map((m, i) => (
                    <StoreCard key={m.id} merchant={m} index={i + open.length} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function StoreCard({ merchant: m, index: i }: { merchant: MerchantProfile; index: number }) {
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const hasBanner = !!m.banner_url && !bannerError;
  const hasLogo = !!m.logo_url && !logoError;

  return (
    <Link
      to="/stores/$id"
      params={{ id: String(m.id) }}
      className="glass-strong block overflow-hidden rounded-3xl transition-transform active:scale-[0.98]"
    >
      {/* Banner */}
      <div className="relative h-36 overflow-hidden">
        {hasBanner ? (
          <img
            src={m.banner_url!}
            alt={m.store_name}
            className="h-full w-full object-cover"
            onError={() => setBannerError(true)}
          />
        ) : (
          <div
            className={`h-full w-full bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} grid place-items-center`}
          >
            <span className="text-6xl opacity-60">{getEmoji(m.business_type)}</span>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Open/closed badge */}
        <div className="absolute right-3 top-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm ${
              m.is_open
                ? "bg-emerald-500/90 text-white"
                : "bg-black/40 text-white/80"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${m.is_open ? "bg-white animate-pulse" : "bg-white/50"}`} />
            {m.is_open ? "Open" : "Closed"}
          </span>
        </div>

        {/* Store name over banner */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h3 className="font-display text-xl leading-tight text-white drop-shadow-md">
            {m.store_name}
          </h3>
        </div>
      </div>

      {/* Details row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Logo */}
        <div className="relative shrink-0">
          {hasLogo ? (
            <img
              src={m.logo_url!}
              alt={m.store_name}
              className="h-10 w-10 rounded-xl object-cover ring-2 ring-background"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-mist text-xl ring-2 ring-background">
              {getEmoji(m.business_type)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {m.business_type || "Café"}
          </p>
          {m.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
              {m.description}
            </p>
          )}
        </div>

        {/* Address */}
        {m.address && (
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="max-w-[80px] truncate">{m.address}</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
// src/routes/merchant/store.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Clock, Loader2, Save, Check, X, ImageIcon, Upload, QrCode } from "lucide-react";
import { merchantApi, type MerchantProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { optimizeImage } from "@/lib/image-optimize";
import { uploadImage } from "@/lib/image-upload";

export const Route = createFileRoute("/merchant/store")({
  head: () => ({ meta: [{ title: "Store · Merchant" }] }),
  component: StoreConfig,
});

type ImgStatus =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "uploading"; previewUrl: string }
  | { status: "done"; previewUrl: string }
  | { status: "error"; error: string };

// ── Small reusable image uploader used inside this file ───────────────────────
function InlineImageUploader({
  label,
  hint,
  currentUrl,
  onUpload,
  onClear,
  aspectClass = "aspect-video",
  shape = "square",
  disabled = false,
  merchantId,
  bucket,
  storagePath,
  preset,
}: {
  label: string;
  hint?: string;
  currentUrl?: string | null;
  onUpload: (url: string) => void;
  onClear: () => void;
  aspectClass?: string;
  shape?: "square" | "circle";
  disabled?: boolean;
  merchantId: string;
  bucket: string;
  storagePath: string;
  preset: "logo" | "banner" | "profile" | "product";
}) {
  const [imgState, setImgState] = useState<ImgStatus>(
    currentUrl ? { status: "done", previewUrl: currentUrl } : { status: "idle" }
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when parent changes currentUrl (e.g. on initial load)
  useEffect(() => {
    if (currentUrl && imgState.status === "idle") {
      setImgState({ status: "done", previewUrl: currentUrl });
    }
  }, [currentUrl]);

  const imgUploading = imgState.status === "processing" || imgState.status === "uploading";
  const displayUrl =
    imgState.status === "uploading" || imgState.status === "done"
      ? imgState.previewUrl
      : currentUrl || null;

  const radiusCls = shape === "circle" ? "rounded-full" : "rounded-2xl";

  async function handleFile(file: File) {
    setImgState({ status: "processing" });
    let optimized;
    try {
      optimized = await optimizeImage(file, preset);
    } catch (err: any) {
      setImgState({ status: "error", error: err.message ?? "Could not process image." });
      return;
    }
    setImgState({ status: "uploading", previewUrl: optimized.previewUrl });
    try {
      const { publicUrl } = await uploadImage(file, preset, bucket, storagePath);
      setImgState({ status: "done", previewUrl: optimized.previewUrl });
      onUpload(publicUrl);
    } catch (err: any) {
      setImgState({ status: "error", error: err.message ?? "Upload failed." });
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleClear() {
    setImgState({ status: "idle" });
    onClear();
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled || imgUploading}
      />
      <div
        className={`relative ${aspectClass} w-full overflow-hidden border-2 border-dashed transition-colors
          ${radiusCls}
          ${disabled || imgUploading ? "cursor-wait" : "cursor-pointer hover:border-ink/40"}
          ${imgState.status === "error" ? "border-rose-400" : ""}
          ${imgState.status === "done" ? "border-emerald-400" : "border-border"}
        `}
        onClick={() => !disabled && !imgUploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {displayUrl ? (
          <img src={displayUrl} alt={label} className={`h-full w-full object-cover ${radiusCls}`} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-mist p-4 text-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">{hint ?? "Click or drag to upload"}</p>
            <p className="text-[10px] text-muted-foreground/60">JPG · PNG · WebP · max 5 MB</p>
          </div>
        )}

        {/* Uploading overlay */}
        {imgUploading && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 ${radiusCls}`}>
            <Loader2 className="h-7 w-7 animate-spin text-white" />
            <p className="text-xs font-medium text-white">
              {imgState.status === "processing" ? "Optimising…" : "Uploading…"}
            </p>
          </div>
        )}

        {/* Done badge */}
        {imgState.status === "done" && (
          <div className="absolute bottom-2 right-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow">
              <Check className="h-3.5 w-3.5 text-white" />
            </span>
          </div>
        )}

        {/* Clear button */}
        {displayUrl && !imgUploading && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Status row */}
      <div className="flex min-h-[18px] items-center justify-between">
        {imgState.status === "error" && (
          <p className="text-xs text-rose-500">{imgState.error}</p>
        )}
        {imgState.status === "done" && (
          <p className="text-xs text-emerald-600">Saved ✓</p>
        )}
        {displayUrl && !imgUploading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:border-ink hover:text-ink disabled:opacity-50"
          >
            <Upload className="h-3 w-3" /> Change
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function StoreConfig() {
  const { merchantProfile: authMerchant } = useAuth();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    store_name: "",
    description: "",
    business_type: "",
    address: "",
    phone: "",
    logo_url: "",
    banner_url: "",
    is_open: true,
    table_ordering_enabled: false,
    allow_pickup: true,
    allow_delivery: false,
    allow_dine_in: false,
  });

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await merchantApi.me();
      setProfile(data);
      setForm({
        store_name: data.store_name || "",
        description: data.description || "",
        business_type: data.business_type || "",
        address: data.address || "",
        phone: data.phone || "",
        logo_url: data.logo_url || "",
        banner_url: data.banner_url || "",
        is_open: data.is_open ?? true,
        table_ordering_enabled: data.table_ordering_enabled ?? false,
        allow_pickup: data.allow_pickup ?? true,
        allow_delivery: data.allow_delivery ?? false,
        allow_dine_in: data.allow_dine_in ?? false,
      });
    } catch (err) {
      setError("Could not load your store profile. Make sure you're logged in as a merchant.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const updated = await merchantApi.update(form);
      setProfile(updated);
      setForm({
        store_name: updated.store_name || "",
        description: updated.description || "",
        business_type: updated.business_type || "",
        address: updated.address || "",
        phone: updated.phone || "",
        logo_url: updated.logo_url || "",
        banner_url: updated.banner_url || "",
        is_open: updated.is_open ?? true,
        table_ordering_enabled: updated.table_ordering_enabled ?? false,
        allow_pickup: updated.allow_pickup ?? true,
        allow_delivery: updated.allow_delivery ?? false,
        allow_dine_in: updated.allow_dine_in ?? false,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={fetchProfile} className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-primary-foreground">
          Retry
        </button>
      </div>
    );
  }

  const merchantId = profile?.id ?? "";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Storefront</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Your store</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          How customers see you in the app. Keep it personal.
        </p>
      </div>

      {/* Open / closed + approval badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => updateField("is_open", !form.is_open)}
          className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium transition-all ${
            form.is_open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${form.is_open ? "bg-emerald-500" : "bg-red-500"}`} />
          {form.is_open ? "Open" : "Closed"}
        </button>
        {profile && !profile.is_approved && (
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-amber-100 px-4 text-xs font-medium text-amber-700">
            Pending approval
          </span>
        )}
      </div>

      {/* ── Banner + Logo images ── */}
      <section className="glass-strong rounded-3xl p-6 space-y-6">
        <h2 className="font-display text-2xl text-ink">Images</h2>

        {/* Banner — wide 12:5 */}
        {merchantId && (
          <InlineImageUploader
            label="Store banner"
            hint="Recommended 1200 × 500 px — shown at the top of your store page"
            currentUrl={form.banner_url}
            onUpload={(url) => updateField("banner_url", url)}
            onClear={() => updateField("banner_url", "")}
            aspectClass="aspect-[12/5]"
            shape="square"
            merchantId={merchantId}
            bucket="banner-images"
            storagePath={`${merchantId}/banner.webp`}
            preset="banner"
          />
        )}

        {/* Logo — circle */}
        {merchantId && (
          <div className="flex items-start gap-5">
            <div className="w-28 shrink-0">
              <InlineImageUploader
                label="Store logo"
                hint="Square"
                currentUrl={form.logo_url}
                onUpload={(url) => updateField("logo_url", url)}
                onClear={() => updateField("logo_url", "")}
                aspectClass="aspect-square"
                shape="circle"
                merchantId={merchantId}
                bucket="merchant-images"
                storagePath={`${merchantId}/logo.webp`}
                preset="logo"
              />
            </div>
            <p className="pt-8 text-xs leading-relaxed text-muted-foreground">
              Shown on the store listing card and in the customer app.
              <br />Min 200 × 200 px recommended.
            </p>
          </div>
        )}
      </section>

      {/* ── Ordering options ── */}
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-ember" />
          <h2 className="font-display text-2xl text-ink">Ordering</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how customers can place orders at your store.
        </p>

        <div className="mt-5 space-y-4">
          {/* Table ordering master toggle */}
          <div className="flex items-center justify-between rounded-2xl bg-mist p-4">
            <div>
              <p className="text-sm font-medium text-ink">Enable table ordering</p>
              <p className="text-xs text-muted-foreground">
                Let customers scan QR codes at their tables to order
              </p>
            </div>
            <button
              onClick={() => {
                const next = !form.table_ordering_enabled;
                updateField("table_ordering_enabled", next);
                if (next) updateField("allow_dine_in", true);
              }}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                form.table_ordering_enabled ? "bg-ember" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  form.table_ordering_enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Order types */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "allow_pickup", label: "Pickup", desc: "Customer collects" },
              { key: "allow_dine_in", label: "Dine-in", desc: "Table ordering" },
              { key: "allow_delivery", label: "Delivery", desc: "Send to address" },
            ].map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => updateField(key, !form[key as keyof typeof form])}
                className={`rounded-2xl border-2 p-3 text-left transition-all ${
                  form[key as keyof typeof form]
                    ? "border-ink bg-ink/5"
                    : "border-border bg-white"
                }`}
              >
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
                {key === "allow_dine_in" && form.table_ordering_enabled && (
                  <span className="mt-1 inline-block rounded-full bg-ember-soft px-2 py-0.5 text-[10px] font-medium text-ember">
                    Requires tables
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live preview card ── */}
      {(form.logo_url || form.banner_url || form.store_name) && (
        <section className="glass-strong overflow-hidden rounded-3xl">
          <p className="px-5 pt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Preview</p>
          <div
            className="relative h-28 bg-gradient-to-br from-ember/40 via-ember-soft to-mist"
            style={
              form.banner_url
                ? { backgroundImage: `url(${form.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                : undefined
            }
          />
          <div className="relative px-5 pb-5">
            <div className="-mt-8 flex items-end gap-3">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-ink text-3xl text-primary-foreground shadow-soft"
                style={
                  form.logo_url
                    ? { backgroundImage: `url(${form.logo_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              >
                {!form.logo_url && "☕"}
              </div>
              <div className="pb-1">
                <p className="font-display text-lg text-ink">{form.store_name || "Your store name"}</p>
                <p className="text-xs text-muted-foreground">{form.business_type || "Café"}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Details ── */}
      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-2xl text-ink">Details</h2>
        <div className="mt-5 space-y-4">
          <Field label="Store name" value={form.store_name} onChange={(v) => updateField("store_name", v)} />
          <Field label="Tagline / Description" value={form.description} onChange={(v) => updateField("description", v)} multiline />
          <Field label="Category" value={form.business_type} onChange={(v) => updateField("business_type", v)} placeholder="e.g. Café · Bakery" />
        </div>
      </section>

      {/* ── Location + Hours ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="glass-strong rounded-3xl p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> Location
          </div>
          <div className="mt-3 space-y-3">
            <Field label="Address" value={form.address} onChange={(v) => updateField("address", v)} placeholder="42 Thamel Street, Kathmandu" />
            <Field label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="+977 98-0000-0000" />
          </div>
        </section>
        <section className="glass-strong rounded-3xl p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Hours
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["Mon – Fri", "7:00 – 18:00"],
              ["Saturday", "8:00 – 19:00"],
              ["Sunday", "8:00 – 16:00"],
            ].map(([d, h]) => (
              <li key={d} className="flex items-center justify-between">
                <span className="text-muted-foreground">{d}</span>
                <span className="text-ink">{h}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] italic text-muted-foreground">Hours editing coming soon</p>
        </section>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm font-medium text-primary-foreground shadow-ember transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-2xl bg-mist px-4 py-3 text-sm text-ink outline-none transition-all focus:ring-2 focus:ring-ember/40"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 h-12 w-full rounded-2xl bg-mist px-4 text-sm text-ink outline-none transition-all focus:ring-2 focus:ring-ember/40"
        />
      )}
    </label>
  );
}
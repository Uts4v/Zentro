// routes/merchant.retails.tsx 
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Star, X, Check,
  Loader2, ImageIcon, Upload, Package, ShoppingBag,
  RefreshCw, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { retailApi, type RetailProduct, type RetailOrder, type OrderStatus } from "@/lib/api";
import { uploadImage } from "@/lib/image-upload";
import { optimizeImage } from "@/lib/image-optimize";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/merchant/retail")({
  head: () => ({ meta: [{ title: "Retail · Merchant · Zentro" }] }),
  component: MerchantRetail,
});

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  category: "",
  emoji: "🍵",
  stock: "-1",
  weight_grams: "",
  is_available: true,
  is_featured: false,
  image_url: "",
};

type FormState = typeof EMPTY_FORM;

type ImgStatus =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "uploading"; previewUrl: string }
  | { status: "done"; previewUrl: string }
  | { status: "error"; error: string };

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

const ADVANCE_LABEL: Record<OrderStatus, string> = {
  pending: "Confirm order",
  confirmed: "Packing",
  preparing: "Mark ready",
  ready: "Mark dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-sky-100 text-sky-700",
  preparing: "bg-violet-100 text-violet-700",
  ready: "bg-emerald-100 text-emerald-700",
  completed: "bg-mist text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-500",
};

function MerchantRetail() {
  const [tab, setTab] = useState<"products" | "orders">("products");

  // Products state
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RetailProduct | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("All");
  const [imgState, setImgState] = useState<ImgStatus>({ status: "idle" });
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Orders state
  const [orders, setOrders] = useState<RetailOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, []);

  async function loadProducts() {
    setProductsLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: mp } = await supabase
        .from("merchant_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mp) setMerchantId(mp.id);
      const data = await retailApi.myProducts();
      setProducts(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProductsLoading(false);
    }
  }

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setOrdersLoading(true);
    else setRefreshing(true);
    try {
      const data = await retailApi.storeOrders();
      setOrders(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOrdersLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Image handling
  async function handleImageFile(file: File) {
    if (!merchantId) return;
    setImgState({ status: "processing" });
    let optimized;
    try {
      optimized = await optimizeImage(file, "product");
    } catch (err: any) {
      setImgState({ status: "error", error: err.message ?? "Could not process image." });
      return;
    }
    setImgState({ status: "uploading", previewUrl: optimized.previewUrl });
    try {
      const key = editing?.id ?? `tmp-${Date.now()}`;
      const { publicUrl } = await uploadImage(
        file, "product", "product-images", `${merchantId}/retail-${key}.webp`
      );
      setForm((f) => ({ ...f, image_url: publicUrl }));
      setImgState({ status: "done", previewUrl: optimized.previewUrl });
    } catch (err: any) {
      setImgState({ status: "error", error: err.message ?? "Upload failed." });
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImgState({ status: "idle" });
    setShowForm(true);
  }

  function openEdit(p: RetailProduct) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category,
      emoji: p.emoji,
      stock: String(p.stock),
      weight_grams: p.weight_grams != null ? String(p.weight_grams) : "",
      is_available: p.is_available,
      is_featured: p.is_featured,
      image_url: p.image_url,
    });
    setImgState(
      p.image_url ? { status: "done", previewUrl: p.image_url } : { status: "idle" }
    );
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setImgState({ status: "idle" });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) return;
    if (imgState.status === "uploading" || imgState.status === "processing") return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: form.price,
        category: form.category,
        emoji: form.emoji,
        stock: Number(form.stock),
        weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
        is_available: form.is_available,
        is_featured: form.is_featured,
        image_url: form.image_url,
      };
      if (editing) {
        const updated = await retailApi.updateProduct(editing.id, payload);
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? updated : p)));
      } else {
        const created = await retailApi.createProduct(payload);
        setProducts((prev) => [created, ...prev]);
      }
      closeForm();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    setDeleting(id);
    try {
      await retailApi.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggle(id: string) {
    setToggling(id);
    try {
      const updated = await retailApi.toggleProduct(id);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  }

  async function advanceOrder(order: RetailOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setAdvancing(order.id);
    try {
      const updated = await retailApi.updateOrderStatus(order.id, next);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(null);
    }
  }

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const visible = filterCat === "All" ? products : products.filter((p) => p.category === filterCat);
  const imgUploading = imgState.status === "processing" || imgState.status === "uploading";
  const imgPreviewUrl =
    imgState.status === "uploading" || imgState.status === "done"
      ? imgState.previewUrl
      : form.image_url || null;

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const activeOrders = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const doneOrders = orders.filter((o) => ["completed", "cancelled"].includes(o.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Store</p>
        <h1 className="font-display mt-1 text-5xl text-ink">Retail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage packaged tea products and retail orders.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 rounded-2xl bg-mist p-1">
        {(["products", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium capitalize transition-all ${
              tab === t
                ? "bg-ink text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t === "orders" ? (
              <span className="flex items-center justify-center gap-2">
                Orders
                {pendingOrders.length > 0 && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ember text-[10px] font-bold text-white">
                    {pendingOrders.length}
                  </span>
                )}
              </span>
            ) : "Products"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button onClick={() => setError("")} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === "products" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-3 flex-1 mr-4">
              {[
                { label: "Total", value: products.length },
                { label: "Available", value: products.filter((p) => p.is_available).length },
                { label: "Featured", value: products.filter((p) => p.is_featured).length },
              ].map(({ label, value }) => (
                <div key={label} className="glass rounded-2xl p-3 text-center">
                  <p className="font-display text-2xl text-ink">{value}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={openCreate}
              className="gradient-ember inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl px-5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Add product
            </button>
          </div>

          {/* Category filter */}
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(cat)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    filterCat === cat
                      ? "bg-ink text-primary-foreground"
                      : "bg-mist text-ink hover:bg-ink/10"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {productsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="glass rounded-3xl py-16 text-center">
              <p className="text-4xl">🍵</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {filterCat === "All"
                  ? "No retail products yet — add your first one."
                  : `No products in "${filterCat}".`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => handleDelete(p.id)}
                  onToggle={() => handleToggle(p.id)}
                  deleting={deleting === p.id}
                  toggling={toggling === p.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === "orders" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => loadOrders(true)}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-mist px-4 text-xs font-medium text-ink disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {ordersLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Incoming */}
              <RetailOrderSection title="Incoming" count={pendingOrders.length} accent>
                {pendingOrders.map((o) => (
                  <RetailOrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedOrder === o.id}
                    onToggle={() => setExpandedOrder((p) => (p === o.id ? null : o.id))}
                    onAdvance={() => advanceOrder(o)}
                    advancing={advancing === o.id}
                  />
                ))}
                {pendingOrders.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No new retail orders</p>
                )}
              </RetailOrderSection>

              {/* Active */}
              <RetailOrderSection title="In progress" count={activeOrders.length}>
                {activeOrders.map((o) => (
                  <RetailOrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedOrder === o.id}
                    onToggle={() => setExpandedOrder((p) => (p === o.id ? null : o.id))}
                    onAdvance={() => advanceOrder(o)}
                    advancing={advancing === o.id}
                  />
                ))}
                {activeOrders.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">Nothing in progress</p>
                )}
              </RetailOrderSection>

              {/* Done */}
              <RetailOrderSection title="Completed" count={doneOrders.length}>
                {doneOrders.slice(0, 20).map((o) => (
                  <RetailOrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedOrder === o.id}
                    onToggle={() => setExpandedOrder((p) => (p === o.id ? null : o.id))}
                    advancing={false}
                  />
                ))}
                {doneOrders.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No completed orders yet</p>
                )}
              </RetailOrderSection>
            </div>
          )}
        </div>
      )}

      {/* Product form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={(e) => e.target === e.currentTarget && closeForm()}
        >
          <div className="glass-strong w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">
                {editing ? "Edit product" : "New retail product"}
              </h2>
              <button
                onClick={closeForm}
                className="grid h-8 w-8 place-items-center rounded-full bg-mist text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {/* Image upload */}
              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Product image
                </p>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = "";
                  }}
                  disabled={imgUploading}
                />
                <div
                  className={`relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
                    imgState.status === "done" ? "border-emerald-400" : "border-border hover:border-ink/40"
                  }`}
                  onClick={() => !imgUploading && imgInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                >
                  {imgPreviewUrl ? (
                    <img src={imgPreviewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 bg-mist">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">Click or drag image here</p>
                    </div>
                  )}
                  {imgUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                  {imgState.status === "done" && (
                    <div className="absolute bottom-2 right-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-4 w-4 text-white" />
                      </span>
                    </div>
                  )}
                  {imgPreviewUrl && !imgUploading && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm((f) => ({ ...f, image_url: "" }));
                        setImgState({ status: "idle" });
                      }}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {imgState.status === "done" && (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => imgInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-ink"
                    >
                      <Upload className="h-3 w-3" /> Change
                    </button>
                  </div>
                )}
              </div>

              {/* Emoji + Name */}
              <div className="flex gap-3">
                <div className="shrink-0">
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">Emoji</label>
                  <input
                    value={form.emoji}
                    onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="h-11 w-16 rounded-xl border border-border bg-white/50 text-center text-xl focus:outline-none"
                    maxLength={2}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Himalayan Green Tea 50g"
                    className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Origin, tasting notes, brewing instructions…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-white/50 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </div>

              {/* Price + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">Price (NPR) *</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="850"
                    className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Green Tea, Black Tea…"
                    list="retail-cats"
                    className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                  <datalist id="retail-cats">
                    {["Green Tea", "Black Tea", "Herbal Tea", "Oolong", "White Tea", "Gift Sets"].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Stock + Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                    Stock (-1 = unlimited)
                  </label>
                  <input
                    type="number" min="-1"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-muted-foreground">
                    Weight (grams)
                  </label>
                  <input
                    type="number" min="0"
                    value={form.weight_grams}
                    onChange={(e) => setForm((f) => ({ ...f, weight_grams: e.target.value }))}
                    placeholder="50"
                    className="h-11 w-full rounded-xl border border-border bg-white/50 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["is_available", "Available"],
                  ["is_featured", "Featured"],
                ] as [keyof FormState, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [key]: !f[key as keyof FormState] }))}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                      form[key as keyof FormState]
                        ? "border-ink bg-ink text-primary-foreground"
                        : "border-border bg-white/50 text-muted-foreground"
                    }`}
                  >
                    {form[key as keyof FormState] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={closeForm} className="h-11 flex-1 rounded-2xl border border-border text-sm text-muted-foreground">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || imgUploading || !form.name.trim() || !form.price}
                className="gradient-ember flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : editing ? "Save changes" : "Add product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product: p, onEdit, onDelete, onToggle, deleting, toggling,
}: {
  product: RetailProduct;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  deleting: boolean;
  toggling: boolean;
}) {
  return (
    <article className={`glass-strong overflow-hidden rounded-3xl transition-opacity ${!p.is_available ? "opacity-60" : ""}`}>
      {p.image_url ? (
        <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-40 items-center justify-center bg-mist text-5xl">{p.emoji}</div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display truncate text-lg text-ink">{p.name}</h3>
              {p.is_featured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            </div>
            {p.category && (
              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                {p.category}
              </span>
            )}
          </div>
          <p className="font-display shrink-0 text-xl text-ink">NPR {Number(p.price).toLocaleString()}</p>
        </div>

        {p.description && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
        )}

        <div className="mt-3 flex gap-2 text-[11px] text-muted-foreground">
          {p.weight_grams && (
            <span className="rounded-full bg-mist px-2 py-0.5">{p.weight_grams}g</span>
          )}
          <span className={`rounded-full px-2 py-0.5 ${
            p.stock === -1 ? "bg-mist" :
            p.stock === 0 ? "bg-rose-100 text-rose-600" :
            "bg-sky-100 text-sky-700"
          }`}>
            {p.stock === -1 ? "Unlimited" : p.stock === 0 ? "Out of stock" : `${p.stock} in stock`}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <button
            onClick={onToggle}
            disabled={toggling}
            className="grid h-8 w-8 place-items-center rounded-xl bg-mist text-muted-foreground hover:text-ink disabled:opacity-50"
          >
            {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              p.is_available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-xl bg-mist text-muted-foreground hover:text-ink">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} disabled={deleting} className="grid h-8 w-8 place-items-center rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 disabled:opacity-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Retail order section ──────────────────────────────────────────────────────

function RetailOrderSection({ title, count, accent, children }: {
  title: string; count: number; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-2 text-[11px] font-medium ${
          accent ? "gradient-ember text-white" : "bg-mist text-ink"
        }`}>
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// ── Retail order card ─────────────────────────────────────────────────────────

function RetailOrderCard({
  order, expanded, onToggle, onAdvance, advancing,
}: {
  order: RetailOrder;
  expanded: boolean;
  onToggle: () => void;
  onAdvance?: () => void;
  advancing: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const mins = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
  const customerName = order.profiles?.full_name ?? "Customer";

  return (
    <article className="glass-strong overflow-hidden rounded-2xl">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-mist/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink truncate">{customerName}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_COLOR[order.status]}`}>
              {order.status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            #{order.id.slice(0, 8)} ·{" "}
            <Clock className="inline h-3 w-3" />{" "}
            {mins < 1 ? "Just now" : `${mins}m ago`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-base text-ink">
            NPR {Number(order.total_amount).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {(order.retail_order_items ?? []).length} item{(order.retail_order_items ?? []).length !== 1 ? "s" : ""}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Shipping info */}
          {(order.shipping_name || order.shipping_address) && (
            <div className="rounded-xl bg-mist p-3 text-xs space-y-0.5">
              <p className="font-medium text-ink">📦 Shipping to</p>
              {order.shipping_name && <p className="text-muted-foreground">{order.shipping_name}</p>}
              {order.shipping_phone && <p className="text-muted-foreground">{order.shipping_phone}</p>}
              {order.shipping_address && <p className="text-muted-foreground">{order.shipping_address}</p>}
            </div>
          )}

          {/* Items */}
          <ul className="space-y-1">
            {(order.retail_order_items ?? []).map((item) => (
              <li key={item.id} className="flex justify-between text-xs">
                <span className="text-ink">{item.quantity}× {item.name}</span>
                <span className="text-muted-foreground">NPR {Number(item.subtotal).toLocaleString()}</span>
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              📝 {order.notes}
            </p>
          )}

          {next && onAdvance && (
            <button
              onClick={onAdvance}
              disabled={advancing}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {ADVANCE_LABEL[order.status]}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
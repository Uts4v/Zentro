import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth, OAUTH_INTENT_KEY } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Loader2, Mail, Lock, User, Store, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth/merchant")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: () => ({ meta: [{ title: "Merchant Sign In · Zentro" }] }),
  component: MerchantAuth,
});

function MerchantAuth() {
  const [mode, setMode]         = useState<"signin" | "signup">("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const { signIn, signUp }      = useAuth();
  const navigate                = useNavigate();
  const { redirect }            = useSearch({ from: "/auth/merchant" });

  // Handle OAuth callback redirect back to this page
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    setOauthLoading(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          subscription.unsubscribe();
          window.history.replaceState(null, "", window.location.pathname);
          navigate({ to: (redirect || "/merchant") as any, replace: true });
        }
      }
    );

    const fallback = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        subscription.unsubscribe();
        window.history.replaceState(null, "", window.location.pathname);
        navigate({ to: (redirect || "/merchant") as any, replace: true });
      } else {
        setOauthLoading(false);
      }
    }, 3000);

    return () => {
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (mode === "signup") {
        const { error: err } = await signUp(email, password, name, {
          role: "merchant",
          store_name: storeName,
        });
        if (err) { setError(err); return; }
        setSuccess("Account created! Sign in to continue.");
        setMode("signin");
        return;
      }

      // Sign in
      const { error: err } = await signIn(email, password);
      if (err) { setError(err); return; }

      // Verify this is actually a merchant account
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sign in failed. Please try again."); return; }

      const { data: mp } = await supabase
        .from("merchant_profiles")
        .select("id, status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!mp) {
        setError("No merchant account found. Use customer sign in instead.");
        await supabase.auth.signOut();
        return;
      }

      if (mp.status === "rejected") {
        setError("Your store application was not approved. Contact support if you think this is a mistake.");
        await supabase.auth.signOut();
        return;
      }

      // Wait briefly for AuthProvider to finish loading merchantProfile
      await new Promise((r) => setTimeout(r, 300));
      navigate({ to: (redirect || "/merchant") as any, replace: true });

    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    sessionStorage.setItem(OAUTH_INTENT_KEY, "merchant");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${import.meta.env.VITE_APP_URL ?? window.location.origin}/auth/merchant`,
      },
    });
    if (err) setError(err.message);
  };

  const handleAppleSignIn = async () => {
    setError(null);
    sessionStorage.setItem(OAUTH_INTENT_KEY, "merchant");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${import.meta.env.VITE_APP_URL ?? window.location.origin}/auth/merchant`,
      },
    });
    if (err) setError(err.message);
  };

  if (oauthLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-5 pb-10 pt-10">
      <Link to="/" className="font-display text-2xl text-ink">
        zentro<span className="text-ember">.</span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          for business
        </span>
      </Link>

      <div className="mt-12">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {mode === "signin" ? "Welcome back" : "Grow with Zentro"}
        </p>
        <h1 className="font-display mt-2 text-5xl leading-[1.05] text-ink">
          {mode === "signin" ? "Manage your\nstore." : "Register your\nbusiness."}
        </h1>
        <p className="mt-3 max-w-[300px] text-sm text-muted-foreground">
          {mode === "signin"
            ? "Orders, loyalty, and analytics — all in one place."
            : "Reach thousands of loyal customers on Zentro."}
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-10 space-y-3">
        {mode === "signup" && (
          <>
            <Field
              label="Your name" placeholder="Maya Rivera"
              icon={<User className="h-4 w-4" />} value={name} onChange={setName}
            />
            <Field
              label="Store name" placeholder="Maison Aria"
              icon={<Store className="h-4 w-4" />} value={storeName} onChange={setStoreName}
            />
          </>
        )}
        <Field
          label="Business email" placeholder="hello@maison.com" type="email"
          icon={<Mail className="h-4 w-4" />} value={email} onChange={setEmail}
        />
        <Field
          label="Password" placeholder="••••••••" type="password"
          icon={<Lock className="h-4 w-4" />} value={password} onChange={setPassword}
        />

        <button
          type="submit" disabled={busy}
          className="mt-6 grid h-14 w-full place-items-center rounded-2xl bg-ink text-sm font-medium text-primary-foreground shadow-ember transition-all hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <span className="flex items-center gap-2">
              {mode === "signin" ? "Sign in" : "Register business"} <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[11px] text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <button type="button" onClick={handleAppleSignIn}
          className="glass flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-ink transition-all hover:bg-mist/80"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.19-.93 3.38-.79 1.44.12 2.52.69 3.22 1.87-2.95 1.77-2.52 5.7.43 6.78-.58 1.56-1.33 3.1-2.11 4.31zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          Continue with Apple
        </button>
        <button type="button" onClick={handleGoogleSignIn}
          className="glass flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-ink transition-all hover:bg-mist/80"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </div>

      <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">
        {mode === "signin" ? "New to Zentro for business?" : "Already have a business account?"}{" "}
        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); }}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Register your business" : "Sign in"}
        </button>
      </p>

      <Link
        to="/auth"
        className="mt-3 block text-center text-xs text-muted-foreground hover:text-ink hover:underline"
      >
        ← Customer sign in
      </Link>
    </div>
  );
}

function Field({ label, placeholder, type = "text", icon, value, onChange }: {
  label: string; placeholder: string; type?: string;
  icon?: React.ReactNode; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <div className="relative mt-1.5">
        {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input
          type={type} placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} required
          className={`h-14 w-full rounded-2xl bg-mist text-sm text-ink outline-none transition-all placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40 ${icon ? "pl-11" : "px-4"} pr-4`}
        />
      </div>
    </label>
  );
}
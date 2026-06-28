import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  streak: number;
  tier: string;
  role?: "customer" | "merchant";
};

type MerchantProfile = {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_approved: boolean;
  created_at: string;
};

type SignUpMeta = {
  role?: "customer" | "merchant";
  store_name?: string;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  merchantProfile: MerchantProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    meta?: SignUpMeta
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMerchantProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── OAuth intent key ──────────────────────────────────────────────────────────
// Google/Apple OAuth carries no info about which page (customer vs merchant)
// initiated the flow, since the user gets fully redirected away to the
// provider and back. We stash intent in sessionStorage right before the
// redirect so we can read it back once the SIGNED_IN event fires here.
export const OAUTH_INTENT_KEY = "zentro_oauth_intent";

function readOAuthIntent(): "merchant" | "customer" | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(OAUTH_INTENT_KEY);
  return v === "merchant" ? "merchant" : v === "customer" ? "customer" : null;
}

function clearOAuthIntent() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(OAUTH_INTENT_KEY);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureProfileExists(userId: string, user: User): Promise<void> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return; // already exists, nothing to do

  const fullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  // FIX: read the intent the auth page stashed before the OAuth redirect.
  // Previously this always hardcoded role: "customer", so a merchant
  // signing up via Google/Apple silently became a customer with no
  // merchant_profiles row at all.
  const intent = readOAuthIntent();
  const role: "customer" | "merchant" = intent === "merchant" ? "merchant" : "customer";

  // TEMP DEBUG — remove once confirmed working
  console.log("[ensureProfileExists] intent:", intent, "→ role:", role, "userId:", userId);

  const profileInsert = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    points: 0,
    streak: 0,
    tier: "Bronze",
    role,
  });

  // TEMP DEBUG — remove once confirmed working
  if (profileInsert.error) {
    console.error("[ensureProfileExists] profiles insert FAILED:", profileInsert.error);
  } else {
    console.log("[ensureProfileExists] profiles insert OK");
  }

  if (role === "merchant") {
    // OAuth never collects a store name, so we seed a placeholder.
    // Surface a "complete your store profile" prompt elsewhere if you
    // want merchants to set a real name/slug before going live.
    const storeName = fullName ? `${fullName}'s Store` : "New Store";
    const merchantInsert = await supabase.from("merchant_profiles").insert({
      user_id: userId,
      store_name: storeName,
      store_slug: slugify(storeName),
      is_approved: false,
    });

    // TEMP DEBUG — remove once confirmed working
    if (merchantInsert.error) {
      console.error("[ensureProfileExists] merchant_profiles insert FAILED:", merchantInsert.error);
    } else {
      console.log("[ensureProfileExists] merchant_profiles insert OK");
    }
  }

  clearOAuthIntent();
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                       = useState<User | null>(null);
  const [session, setSession]                 = useState<Session | null>(null);
  const [profile, setProfile]                 = useState<Profile | null>(null);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading]                 = useState(true);

  // Counts how many parallel fetches are in flight.
  // loading stays true until all of them settle.
  const pendingFetches = useRef(0);

  // ── Profile fetch ───────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      // Keep null if row genuinely doesn't exist yet —
      // don't fabricate a fake "guest" object
      setProfile((data as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  // ── Merchant profile fetch ──────────────────────────────────────────────────
  // Always query by user_id — never trust user_metadata.role,
  // which may be missing for OAuth or older accounts.

  const fetchMerchantProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("merchant_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      setMerchantProfile((data as MerchantProfile) ?? null);
    } catch {
      setMerchantProfile(null);
    }
  }, []);

  // ── Public refresh helpers ──────────────────────────────────────────────────

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshMerchantProfile = useCallback(async () => {
    if (user?.id) await fetchMerchantProfile(user.id);
  }, [user, fetchMerchantProfile]);

  // ── Core auth effect ────────────────────────────────────────────────────────
  // onAuthStateChange is the single source of truth.
  // INITIAL_SESSION fires on every page load after localStorage is read,
  // so we never need a separate getSession() call.

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const userId = s.user.id;
        const isOAuth =
          s.user.app_metadata?.provider === "google" ||
          s.user.app_metadata?.provider === "apple";

        // For OAuth sign-ins, make sure a profiles row exists (and, if the
        // intent was "merchant", a merchant_profiles row too).
        // Email signUp() creates these explicitly; OAuth skips that path.
        // The DB trigger (handle_new_user) is the primary guard,
        // but this is a reliable client-side fallback.
        if (event === "SIGNED_IN" && isOAuth) {
          await ensureProfileExists(userId, s.user);
        }

        // Fire both fetches in parallel; keep loading=true until both finish
        pendingFetches.current = 2;

        fetchProfile(userId).finally(() => {
          pendingFetches.current -= 1;
          if (pendingFetches.current === 0) setLoading(false);
        });

        fetchMerchantProfile(userId).finally(() => {
          pendingFetches.current -= 1;
          if (pendingFetches.current === 0) setLoading(false);
        });
      } else {
        // Signed out or no session
        setProfile(null);
        setMerchantProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchMerchantProfile]);

  // ── Sign up ─────────────────────────────────────────────────────────────────

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      meta?: SignUpMeta
    ): Promise<{ error: string | null }> => {
      const role = meta?.role ?? "customer";

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            role,
            ...(meta?.store_name ? { store_name: meta.store_name } : {}),
          },
        },
      });

      if (error) return { error: error.message };

      // Create DB rows immediately — don't wait for the email confirm redirect
      const {
        data: { user: u },
      } = await supabase.auth.getUser();

      if (u) {
        await supabase.from("profiles").upsert(
          {
            id: u.id,
            full_name: name,
            avatar_url: null,
            points: 0,
            streak: 0,
            tier: "Bronze",
            role,
          },
          { onConflict: "id" }
        );

        if (role === "merchant" && meta?.store_name) {
          await supabase.from("merchant_profiles").upsert(
            {
              user_id: u.id,
              store_name: meta.store_name,
              store_slug: slugify(meta.store_name),
              is_approved: false,
            },
            { onConflict: "user_id" }
          );
        }
      }

      return { error: null };
    },
    []
  );

  // ── Sign in ─────────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      return { error: null };
    },
    []
  );

  // ── Sign out ────────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setMerchantProfile(null);
  }, []);

  // ── Context value ───────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        merchantProfile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        refreshMerchantProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
// lib/auth.tsx
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
  role?: "customer" | "merchant" | "admin";
};

type MerchantStatus = "pending" | "approved" | "rejected";

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
  status: MerchantStatus;
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
  isAdmin: boolean;
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
  // Verify the session is actually valid before touching the DB.
  // On tab refocus, onAuthStateChange fires INITIAL_SESSION with a cached
  // user object before the token is refreshed — the auth.users row is fine
  // but getUser() will 403 until the refresh completes. Skip the upsert
  // entirely if we can't confirm the user is real right now; the next
  // TOKEN_REFRESHED event will re-run this with a valid JWT.
  const { data: { user: verified }, error: verifyErr } = await supabase.auth.getUser();
  if (verifyErr || !verified || verified.id !== userId) {
    console.warn(
      "[ensureProfileExists] skipping — user not verified yet",
      verifyErr?.message
    );
    return;
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    clearOAuthIntent();
    return;
  }

  const fullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const intent = readOAuthIntent();
  const role: "customer" | "merchant" = intent === "merchant" ? "merchant" : "customer";

  const profileUpsert = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      points: 0,
      streak: 0,
      tier: "Bronze",
      role,
    },
    { onConflict: "id" }
  );

  if (profileUpsert.error) {
    console.error("[ensureProfileExists] profiles upsert failed:", profileUpsert.error);
  }

  if (role === "merchant") {
    const storeName = fullName ? `${fullName}'s Store` : "New Store";
    const merchantUpsert = await supabase.from("merchant_profiles").upsert(
      {
        user_id: userId,
        store_name: storeName,
        store_slug: slugify(storeName),
        status: "pending",
      },
      { onConflict: "user_id" }
    );

    if (merchantUpsert.error) {
      console.error(
        "[ensureProfileExists] merchant_profiles upsert failed:",
        merchantUpsert.error
      );
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

  const pendingFetches = useRef(0);

  // ── Profile fetch ───────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  // ── Merchant profile fetch ──────────────────────────────────────────────────

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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const userId = s.user.id;

        // Only run ensureProfileExists on real auth events, NOT on
        // INITIAL_SESSION (tab refocus). INITIAL_SESSION fires before the
        // token refresh completes, so getUser() inside ensureProfileExists
        // will 403 and trigger a FK violation. TOKEN_REFRESHED fires once
        // the new JWT is ready and is safe to use.
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await ensureProfileExists(userId, s.user);
        }

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

      // Use getSession() (reads from localStorage + validates) rather than
      // getUser() (hits Auth server which may 403 if JWT hasn't propagated).
      // onAuthStateChange will also fire SIGNED_IN and handle profile
      // creation via ensureProfileExists, so this is a best-effort early upsert.
      const {
        data: { session: newSession },
      } = await supabase.auth.getSession();

      if (newSession?.user) {
        const u = newSession.user;
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
              status: "pending",
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

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        merchantProfile,
        loading,
        isAdmin,
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
import { useEffect, useState, useCallback, useRef } from "react";
import { Bell, X, ShoppingBag, Gift, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppNotification } from "@/lib/api";

const ICONS: Record<string, typeof Bell> = {
  new_order: ShoppingBag,
  reward_redeemed: Gift,
  punch_claim: Gift,
  order_status_completed: CheckCircle2,
  order_status_cancelled: XCircle,
  redemption_confirmed: CheckCircle2,
  punch_claim_confirmed: CheckCircle2,
};

function iconFor(type: string) {
  return ICONS[type] ?? Bell;
}

type ToastItem = AppNotification & { _toastId: string };

export function NotificationToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t._toastId !== toastId));
    const timer = timers.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(toastId);
    }
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`notifications-toast:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const notif = payload.new as AppNotification;
            const toastId = `${notif.id}-${Date.now()}`;
            const toast: ToastItem = { ...notif, _toastId: toastId };

            setToasts((prev) => [toast, ...prev].slice(0, 4));

            const timer = setTimeout(() => dismiss(toastId), 6000);
            timers.current.set(toastId, timer);

            // Optional: play a soft ping sound if you drop a file at
            // /public/notification.mp3 — safe to leave in even without one,
            // it just silently fails.
            try {
              const audio = new Audio("/notification.mp3");
              audio.volume = 0.4;
              audio.play().catch(() => {});
            } catch {}
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = iconFor(t.type);
        return (
          <div
            key={t._toastId}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-2xl animate-in slide-in-from-top-4 fade-in duration-300"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.body}</p>
            </div>
            <button
              onClick={() => dismiss(t._toastId)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-mist"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
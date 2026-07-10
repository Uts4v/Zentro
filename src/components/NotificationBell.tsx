import { useEffect, useState, useCallback, useRef } from "react";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notificationApi, type AppNotification } from "@/lib/api";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationApi.list();
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();

    let cancelled = false;
    const channelRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;

      const ch = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            setNotifications((prev) => [newNotif, ...prev].slice(0, 30));
            setUnreadCount((c) => c + 1);
          }
        )
        .subscribe();

      channelRef.current = ch;
    });

    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkRead(n: AppNotification) {
    if (n.is_read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationApi.markRead(n.id);
    } catch (e) {
      console.error("Failed to mark notification read:", e);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await notificationApi.markAllRead();
    } catch (e) {
      console.error("Failed to mark all read:", e);
    }
  }

  function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-full bg-mist text-ink"
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ember px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop — also lets tapping outside the panel close it on touch devices */}
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />

          {/*
            Anchored to the viewport (fixed), not the button (absolute).
            On mobile it's pinned to left/right edges with a safe margin,
            so it can never spill off-screen regardless of where the bell
            sits in the header. On wider screens (sm:) it switches back to
            a compact dropdown under the bell.
          */}
          <div
            ref={panelRef}
            className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+64px)] z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-ink">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-ink"
                >
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {loading ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
              ) : notifications.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n)}
                    className={`block w-full border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-mist ${
                      n.is_read ? "bg-white" : "bg-ember-soft/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      {!n.is_read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">{timeAgo(n.created_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
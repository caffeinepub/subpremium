import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import { formatTimeAgo } from "../utils/format";

function notifIcon(type: AppNotification["type"]) {
  if (type === "upload") return "🎬";
  if (type === "like") return "❤️";
  return "💬";
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNotificationClick: (videoId: string) => void;
  onOpen: () => void;
}

export function NotificationsPanel({
  open,
  onClose,
  notifications,
  onNotificationClick,
  onOpen,
}: NotificationsPanelProps) {
  useEffect(() => {
    if (open) {
      onOpen();
    }
  }, [open, onOpen]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        data-ocid="notifications.panel"
        className="h-[80vh] flex flex-col p-0 rounded-t-2xl"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4 text-primary" />
            Notifications
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {notifications.length === 0 ? (
            <div
              data-ocid="notifications.empty_state"
              className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground"
            >
              <Bell className="w-10 h-10 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notif, i) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    data-ocid={`notifications.item.${i + 1}`}
                    onClick={() => {
                      onNotificationClick(notif.videoId);
                    }}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50 ${
                      !notif.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="text-xl shrink-0 mt-0.5">
                      {notifIcon(notif.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-snug">
                        {notif.title}
                        {!notif.read && (
                          <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-primary rounded-full align-middle" />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {formatTimeAgo(notif.timestamp)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

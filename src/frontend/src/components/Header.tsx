import { Input } from "@/components/ui/input";
import { Bell, Play, Search, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onProfileClick: () => void;
  onLoginClick: () => void;
  onBellClick: () => void;
  unreadCount: number;
}

export function Header({
  searchQuery,
  onSearchChange,
  onProfileClick,
  onLoginClick,
  onBellClick,
  unreadCount,
}: HeaderProps) {
  const { user } = useAuth();
  const initials = user ? user.displayName.slice(0, 2).toUpperCase() : null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-md mx-auto px-3">
        {/* Row 1: Brand + Actions */}
        <div className="flex items-center justify-between h-12">
          {/* Brand */}
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <Play
                className="w-3.5 h-3.5 text-white fill-white"
                aria-hidden="true"
              />
            </div>
            <span className="text-sm font-bold tracking-widest text-primary uppercase whitespace-nowrap">
              SUB PREMIUM
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-ocid="header.bell.button"
              onClick={onBellClick}
              className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
              aria-label="Notifications"
            >
              <Bell
                className="w-[18px] h-[18px] text-foreground"
                aria-hidden="true"
              />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 min-w-[16px] h-4 px-0.5 bg-primary rounded-full border border-background flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                </span>
              )}
            </button>
            <button
              type="button"
              data-ocid="header.profile.button"
              onClick={user ? onProfileClick : onLoginClick}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:ring-2 hover:ring-primary transition-all overflow-hidden"
              aria-label={user ? "Profile" : "Login"}
            >
              {initials ? (
                <span className="text-[11px] font-bold text-foreground">
                  {initials}
                </span>
              ) : (
                <User
                  className="w-4 h-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Search bar */}
        <div className="pb-2.5">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              data-ocid="header.search_input"
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-9 pr-3 bg-secondary border-0 rounded-full text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

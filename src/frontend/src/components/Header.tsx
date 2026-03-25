import { Input } from "@/components/ui/input";
import { Bell, Play, Search, User } from "lucide-react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onProfileClick: () => void;
}

export function Header({
  searchQuery,
  onSearchChange,
  onProfileClick,
}: HeaderProps) {
  const { identity, loginStatus } = useInternetIdentity();
  const isLoggedIn = loginStatus === "success" && !!identity;
  const initials = isLoggedIn
    ? identity!.getPrincipal().toString().slice(0, 2).toUpperCase()
    : null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2.5 max-w-md mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Play
              className="w-3.5 h-3.5 text-white fill-white"
              aria-hidden="true"
            />
          </div>
          <span className="text-[11px] font-bold tracking-widest text-primary uppercase leading-none">
            SUB
            <br />
            PREMIUM
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            data-ocid="header.search_input"
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8 pr-3 bg-secondary border-0 rounded-full text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-ocid="header.bell.button"
            className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            aria-label="Notifications"
          >
            <Bell
              className="w-[18px] h-[18px] text-foreground"
              aria-hidden="true"
            />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary rounded-full border border-background" />
          </button>
          <button
            type="button"
            data-ocid="header.profile.button"
            onClick={onProfileClick}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:ring-2 hover:ring-primary transition-all overflow-hidden"
            aria-label="Profile"
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
    </header>
  );
}

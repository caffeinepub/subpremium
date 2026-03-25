import { Separator } from "@/components/ui/separator";
import { ChevronRight, Info, LogIn, LogOut, Shield } from "lucide-react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { truncatePrincipal } from "../utils/format";

export function MenuView() {
  const { identity, login, clear, loginStatus, isInitializing } =
    useInternetIdentity();
  const isLoggedIn = loginStatus === "success" && !!identity;
  const isLoggingIn = loginStatus === "logging-in";
  const principal = identity?.getPrincipal().toString() ?? "";

  return (
    <div className="px-4 pt-4 pb-24 animate-fade-in">
      <h1 className="text-lg font-bold mb-5">Menu</h1>

      <div className="bg-surface rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            {isLoggedIn ? (
              <span className="text-sm font-bold">
                {principal.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <Shield
                className="w-5 h-5 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isLoggedIn ? (
              <>
                <p className="text-sm font-semibold">Logged In</p>
                <p className="text-xs text-muted-foreground truncate">
                  {truncatePrincipal(principal)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Not logged in</p>
                <p className="text-xs text-muted-foreground">
                  Login to upload and interact
                </p>
              </>
            )}
          </div>
        </div>

        <Separator className="bg-border" style={{ margin: "0 16px" }} />

        {isLoggedIn ? (
          <button
            type="button"
            data-ocid="menu.logout.button"
            onClick={clear}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left"
          >
            <LogOut className="w-5 h-5 text-destructive" aria-hidden="true" />
            <span className="text-sm font-medium text-destructive">Logout</span>
            <ChevronRight
              className="w-4 h-4 text-muted-foreground ml-auto"
              aria-hidden="true"
            />
          </button>
        ) : (
          <button
            type="button"
            data-ocid="menu.login.button"
            onClick={login}
            disabled={isLoggingIn || isInitializing}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
          >
            <LogIn className="w-5 h-5 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-primary">
              {isLoggingIn ? "Connecting..." : "Login"}
            </span>
            <ChevronRight
              className="w-4 h-4 text-muted-foreground ml-auto"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <div className="bg-surface rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <Info className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">SUB PREMIUM</p>
            <p className="text-xs text-muted-foreground">
              Decentralized Video Platform
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8">
        &copy; {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          caffeine.ai
        </a>
      </p>
    </div>
  );
}

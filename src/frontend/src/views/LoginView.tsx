import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface LoginViewProps {
  onSuccess: () => void;
  onSignupClick: () => void;
  onBack: () => void;
}

export function LoginView({
  onSuccess,
  onSignupClick,
  onBack,
}: LoginViewProps) {
  const { login, loginAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    setError(null);
    setIsLoading(true);

    // Hard 15s failsafe — only fires if server is completely unreachable
    let failsafeFired = false;
    const failsafeTimer = setTimeout(() => {
      failsafeFired = true;
      setIsLoading(false);
      loginAsGuest(email);
      onSuccess();
    }, 15000);

    try {
      const err = await login(email, password, rememberMe);
      clearTimeout(failsafeTimer);
      if (failsafeFired) return; // failsafe already handled
      setIsLoading(false);
      if (!err) {
        onSuccess();
      } else if (err === "timeout") {
        // Backend unreachable — allow as guest
        loginAsGuest(email);
        onSuccess();
      } else {
        setError(err);
      }
    } catch {
      clearTimeout(failsafeTimer);
      if (failsafeFired) return;
      setIsLoading(false);
      loginAsGuest(email);
      onSuccess();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          type="button"
          data-ocid="login.back.button"
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-6 pb-16 max-w-md mx-auto w-full">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-xs font-bold tracking-widest text-primary uppercase leading-none">
            SUB
            <br />
            PREMIUM
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Sign in to continue watching
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="login-email"
              data-ocid="login.input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="h-11 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="login-password"
                data-ocid="login.input"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary pr-11"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              id="remember-me"
              data-ocid="login.checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded accent-primary cursor-pointer"
              disabled={isLoading}
            />
            <label
              htmlFor="remember-me"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Remember me
            </label>
          </div>

          {error && (
            <div
              data-ocid="login.error_state"
              className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2.5"
              role="alert"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            data-ocid="login.submit_button"
            disabled={isLoading}
            className="w-full h-11 font-semibold text-sm mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              data-ocid="login.signup.link"
              onClick={onSignupClick}
              className="text-primary font-semibold hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

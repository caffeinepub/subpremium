import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Play,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface SignupViewProps {
  onSuccess: () => void;
  onLoginClick: () => void;
  onBack: () => void;
}

export function SignupView({
  onSuccess,
  onLoginClick,
  onBack,
}: SignupViewProps) {
  const { signup, loginAsGuest } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || success) return;
    if (!displayName.trim() || !email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError(null);
    setIsLoading(true);

    // Hard 15s failsafe — only fires if server is completely unreachable
    let failsafeFired = false;
    const failsafeTimer = setTimeout(() => {
      failsafeFired = true;
      setIsLoading(false);
      loginAsGuest(email, displayName);
      onSuccess();
    }, 15000);

    try {
      const err = await signup(displayName, email, password);
      clearTimeout(failsafeTimer);
      if (failsafeFired) return;
      setIsLoading(false);
      if (!err) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 1200);
      } else if (err === "timeout" || err.includes("timed out")) {
        // Backend unreachable — allow as guest
        loginAsGuest(email, displayName);
        onSuccess();
      } else {
        setError(`Signup failed. ${err}`);
      }
    } catch {
      clearTimeout(failsafeTimer);
      if (failsafeFired) return;
      setIsLoading(false);
      loginAsGuest(email, displayName);
      onSuccess();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          type="button"
          data-ocid="signup.back.button"
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
          aria-label="Go back"
          disabled={isLoading}
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

        <h1 className="text-2xl font-bold mb-1">Create account</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Join SUB PREMIUM today
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="signup-name" className="text-sm font-medium">
              Display Name
            </Label>
            <Input
              id="signup-name"
              data-ocid="signup.input"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="h-11 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
              disabled={isLoading || success}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="signup-email"
              data-ocid="signup.input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="h-11 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
              disabled={isLoading || success}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="signup-password"
                data-ocid="signup.input"
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary pr-11"
                disabled={isLoading || success}
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

          {error && (
            <div
              data-ocid="signup.error_state"
              className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2.5"
              role="alert"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            data-ocid="signup.submit_button"
            disabled={isLoading || success}
            className="w-full h-11 font-semibold text-sm mt-2"
          >
            {success ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Account created
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              data-ocid="signup.login.link"
              onClick={onLoginClick}
              className="text-primary font-semibold hover:underline"
              disabled={isLoading}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

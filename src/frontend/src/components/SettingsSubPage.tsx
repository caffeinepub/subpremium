import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface SettingsSubPageProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

export function SettingsSubPage({
  title,
  onBack,
  children,
}: SettingsSubPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Fixed top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-3 py-3 max-w-md mx-auto">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">{title}</h1>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="max-w-md mx-auto pt-14 pb-28 px-4">{children}</div>
    </div>
  );
}

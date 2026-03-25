import { Clock, Home, Menu, Plus } from "lucide-react";
import type { ViewName } from "../types/video";

interface BottomNavProps {
  current: ViewName;
  onChange: (view: ViewName) => void;
}

export function BottomNav({ current, onChange }: BottomNavProps) {
  const items = [
    { id: "home" as ViewName, label: "Home", icon: Home },
    { id: "upload" as ViewName, label: null as null, icon: Plus },
    { id: "history" as ViewName, label: "History", icon: Clock },
    { id: "menu" as ViewName, label: "Menu", icon: Menu },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-center justify-around px-2 py-1 max-w-md mx-auto">
        {items.map((item) => {
          if (item.label === null) {
            return (
              <button
                type="button"
                key={item.id}
                data-ocid="nav.upload.button"
                onClick={() => onChange(item.id)}
                className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-primary text-white shadow-lg -mt-4 hover:opacity-90 active:scale-95 transition-all"
                aria-label="Upload video"
              >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
              </button>
            );
          }

          const isActive =
            current === item.id || (item.id === "home" && current === "video");
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              data-ocid={`nav.${item.id}.link`}
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-4 rounded-lg transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                {isActive && (
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
                )}
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

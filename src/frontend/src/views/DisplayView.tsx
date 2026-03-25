import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Check } from "lucide-react";
import { SettingsSubPage } from "../components/SettingsSubPage";
import { useSettings } from "../hooks/useSettings";
import type { UserSettings } from "../hooks/useSettings";

const FONT_SIZES: {
  value: UserSettings["fontSize"];
  label: string;
  desc: string;
}[] = [
  { value: "small", label: "Small", desc: "Compact text" },
  { value: "medium", label: "Medium", desc: "Default size" },
  { value: "large", label: "Large", desc: "Larger text" },
];

interface DisplayViewProps {
  onBack: () => void;
}

export function DisplayView({ onBack }: DisplayViewProps) {
  const { settings, updateSetting } = useSettings();

  return (
    <SettingsSubPage title="Display" onBack={onBack}>
      {/* Dark Mode */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
          Theme
        </p>
        <div className="bg-card rounded-2xl overflow-hidden">
          <div
            data-ocid="display.darkmode.row"
            className="flex items-center justify-between px-4 py-4"
          >
            <div>
              <Label className="text-sm font-medium">Dark Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.darkMode ? "Dark theme active" : "Light theme active"}
              </p>
            </div>
            <Switch
              data-ocid="display.darkmode.switch"
              checked={settings.darkMode}
              onCheckedChange={(v) => updateSetting("darkMode", v)}
            />
          </div>
        </div>
      </div>

      {/* Font Size */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
          Font Size
        </p>
        <div className="bg-card rounded-2xl overflow-hidden">
          {FONT_SIZES.map(({ value, label, desc }, idx) => (
            <div key={value}>
              {idx > 0 && <Separator />}
              <button
                type="button"
                data-ocid={`display.fontsize.item.${idx + 1}`}
                onClick={() => updateSetting("fontSize", value)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                {settings.fontSize === value && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </SettingsSubPage>
  );
}

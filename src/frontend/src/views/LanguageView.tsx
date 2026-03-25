import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { SettingsSubPage } from "../components/SettingsSubPage";
import { useSettings } from "../hooks/useSettings";

const APP_LANGUAGES = [
  "English",
  "Hindi",
  "Arabic",
  "Spanish",
  "French",
  "Chinese",
];
const SUBTITLE_LANGS = [
  "none",
  "English",
  "Hindi",
  "Arabic",
  "Spanish",
  "French",
  "Chinese",
];

interface LanguageViewProps {
  onBack: () => void;
}

export function LanguageView({ onBack }: LanguageViewProps) {
  const { settings, updateSetting } = useSettings();

  return (
    <SettingsSubPage title="Language" onBack={onBack}>
      {/* App Language */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
          App Language
        </p>
        <div className="bg-card rounded-2xl overflow-hidden">
          {APP_LANGUAGES.map((lang, idx) => (
            <div key={lang}>
              {idx > 0 && <Separator />}
              <button
                type="button"
                data-ocid={`language.app.item.${idx + 1}`}
                onClick={() => updateSetting("appLanguage", lang)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors"
              >
                <span className="text-sm font-medium">{lang}</span>
                {settings.appLanguage === lang && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Subtitle Default Language */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
          Subtitle Default Language
        </p>
        <div className="bg-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4">
            <Label className="text-sm font-medium">Default for subtitles</Label>
            <Select
              value={settings.subtitleDefaultLanguage}
              onValueChange={(v) => updateSetting("subtitleDefaultLanguage", v)}
            >
              <SelectTrigger
                data-ocid="language.subtitle.select"
                className="w-32 h-9 text-sm bg-secondary border-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_LANGS.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang === "none" ? "None" : lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </SettingsSubPage>
  );
}

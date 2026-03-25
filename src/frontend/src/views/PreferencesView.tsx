import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Smartphone, Wifi } from "lucide-react";
import { SettingsSubPage } from "../components/SettingsSubPage";
import { useSettings } from "../hooks/useSettings";

const SUBTITLE_LANGS = [
  "none",
  "English",
  "Hindi",
  "Arabic",
  "Spanish",
  "French",
  "Chinese",
];

const QUALITY_OPTIONS = [
  {
    value: "auto",
    label: "Auto",
    description: "Adjusts based on network speed",
  },
  {
    value: "higher",
    label: "Higher quality",
    description: "Best available resolution",
  },
  {
    value: "datasaver",
    label: "Data saver",
    description: "Lower resolution (360p)",
  },
];

interface PreferencesViewProps {
  onBack: () => void;
}

export function PreferencesView({ onBack }: PreferencesViewProps) {
  const { settings, updateSetting } = useSettings();

  return (
    <SettingsSubPage title="Preferences" onBack={onBack}>
      <div className="bg-card rounded-2xl overflow-hidden mt-4">
        {/* Autoplay */}
        <div
          data-ocid="preferences.autoplay.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <div>
            <Label className="text-sm font-medium">Autoplay Videos</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically play next video
            </p>
          </div>
          <Switch
            data-ocid="preferences.autoplay.switch"
            checked={settings.autoplayVideos}
            onCheckedChange={(v) => updateSetting("autoplayVideos", v)}
          />
        </div>

        <Separator />

        {/* Video Quality */}
        <div
          data-ocid="preferences.quality.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <Label className="text-sm font-medium">Default Video Quality</Label>
          <Select
            value={settings.videoQuality}
            onValueChange={(v) =>
              updateSetting("videoQuality", v as "auto" | "720p" | "1080p")
            }
          >
            <SelectTrigger
              data-ocid="preferences.quality.select"
              className="w-28 h-9 text-sm bg-secondary border-border"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Subtitles */}
        <div
          data-ocid="preferences.subtitles.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <Label className="text-sm font-medium">Default Subtitles</Label>
          <Select
            value={settings.subtitlesLanguage}
            onValueChange={(v) => updateSetting("subtitlesLanguage", v)}
          >
            <SelectTrigger
              data-ocid="preferences.subtitles.select"
              className="w-28 h-9 text-sm bg-secondary border-border"
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

      {/* Video Quality Preferences */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
          Video Quality Preferences
        </h3>
        <div className="bg-card rounded-2xl overflow-hidden">
          {/* Mobile Network */}
          <div data-ocid="preferences.quality_mobile.row" className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Mobile Network</Label>
            </div>
            <Select
              value={settings.videoQualityMobile}
              onValueChange={(v) =>
                updateSetting(
                  "videoQualityMobile",
                  v as "auto" | "higher" | "datasaver",
                )
              }
            >
              <SelectTrigger
                data-ocid="preferences.quality_mobile.select"
                className="w-full h-10 text-sm bg-secondary border-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        — {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {
                QUALITY_OPTIONS.find(
                  (o) => o.value === settings.videoQualityMobile,
                )?.description
              }
            </p>
          </div>

          <Separator />

          {/* Wi-Fi Network */}
          <div data-ocid="preferences.quality_wifi.row" className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Wi-Fi Network</Label>
            </div>
            <Select
              value={settings.videoQualityWifi}
              onValueChange={(v) =>
                updateSetting(
                  "videoQualityWifi",
                  v as "auto" | "higher" | "datasaver",
                )
              }
            >
              <SelectTrigger
                data-ocid="preferences.quality_wifi.select"
                className="w-full h-10 text-sm bg-secondary border-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        — {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {
                QUALITY_OPTIONS.find(
                  (o) => o.value === settings.videoQualityWifi,
                )?.description
              }
            </p>
          </div>
        </div>
      </div>
    </SettingsSubPage>
  );
}

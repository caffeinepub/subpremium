import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SettingsSubPage } from "../components/SettingsSubPage";
import { useSettings } from "../hooks/useSettings";

interface PrivacyViewProps {
  onBack: () => void;
}

export function PrivacyView({ onBack }: PrivacyViewProps) {
  const { settings, updateSetting } = useSettings();

  return (
    <SettingsSubPage title="Privacy" onBack={onBack}>
      <div className="bg-card rounded-2xl overflow-hidden mt-4">
        {/* Account Visibility */}
        <div
          data-ocid="privacy.account_visibility.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <div>
            <Label className="text-sm font-medium">Account Visibility</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settings.accountPublic ? "Public" : "Private"}
            </p>
          </div>
          <Switch
            data-ocid="privacy.account_public.switch"
            checked={settings.accountPublic}
            onCheckedChange={(v) => updateSetting("accountPublic", v)}
          />
        </div>

        <Separator />

        {/* Allow Comments */}
        <div
          data-ocid="privacy.allow_comments.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <div>
            <Label className="text-sm font-medium">Allow Comments</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Let others comment on your videos
            </p>
          </div>
          <Switch
            data-ocid="privacy.allow_comments.switch"
            checked={settings.allowComments}
            onCheckedChange={(v) => updateSetting("allowComments", v)}
          />
        </div>

        <Separator />

        {/* Allow Downloads */}
        <div
          data-ocid="privacy.allow_downloads.row"
          className="flex items-center justify-between px-4 py-4"
        >
          <div>
            <Label className="text-sm font-medium">Allow Downloads</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Let others download your videos
            </p>
          </div>
          <Switch
            data-ocid="privacy.allow_downloads.switch"
            checked={settings.allowDownloads}
            onCheckedChange={(v) => updateSetting("allowDownloads", v)}
          />
        </div>
      </div>
    </SettingsSubPage>
  );
}

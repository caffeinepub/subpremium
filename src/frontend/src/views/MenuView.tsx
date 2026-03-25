import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Camera,
  Check,
  ChevronRight,
  Globe,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Pencil,
  Shield,
  Sliders,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";

type SettingsPage = "privacy" | "preferences" | "language" | "display";

interface MenuViewProps {
  onLoginClick: () => void;
  onSettingsClick: (page: SettingsPage) => void;
  onCreatorDashboard?: () => void;
}

const SETTINGS_ITEMS: {
  icon: React.ElementType;
  label: string;
  page: SettingsPage;
}[] = [
  { icon: Shield, label: "Privacy", page: "privacy" },
  { icon: Sliders, label: "Preferences", page: "preferences" },
  { icon: Globe, label: "Language", page: "language" },
  { icon: Monitor, label: "Display", page: "display" },
];

export function MenuView({
  onLoginClick,
  onSettingsClick,
  onCreatorDashboard,
}: MenuViewProps) {
  const { user, logout, updateProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditName(user?.displayName ?? "");
    setEditUsername(user?.username ?? "");
    setEditError("");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditError("");
  }

  async function saveEdit() {
    setIsSaving(true);
    setEditError("");
    const err = await updateProfile(editName, editUsername, user?.avatarUrl);
    setIsSaving(false);
    if (err) {
      setEditError(err);
    } else {
      setIsEditing(false);
    }
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await updateProfile(
        user?.displayName ?? "",
        user?.username ?? "",
        dataUrl,
      );
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function removeAvatar() {
    await updateProfile(user?.displayName ?? "", user?.username ?? "", "");
  }

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex flex-col min-h-full px-4 pt-4 pb-28 animate-fade-in">
      {/* ── Profile Header Card ── */}
      <div className="bg-card rounded-2xl p-4 mb-4 shadow-card">
        {user ? (
          <>
            <div className="flex items-center gap-4">
              {/* Avatar with dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-ocid="profile.avatar.button"
                    className="relative shrink-0 w-20 h-20 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                    aria-label="Change profile photo"
                  >
                    <Avatar className="w-20 h-20">
                      <AvatarImage
                        src={user.avatarUrl || undefined}
                        alt={user.displayName}
                      />
                      <AvatarFallback className="bg-secondary text-foreground text-xl font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem
                    data-ocid="profile.avatar.upload_button"
                    onSelect={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Upload Photo
                  </DropdownMenuItem>
                  {user.avatarUrl && (
                    <DropdownMenuItem
                      data-ocid="profile.avatar.delete_button"
                      onSelect={removeAvatar}
                      className="text-red-400 focus:text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Photo
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Name / username / email */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <Label
                        htmlFor="edit-name"
                        className="text-xs text-muted-foreground mb-1 block"
                      >
                        Display Name
                      </Label>
                      <Input
                        id="edit-name"
                        data-ocid="profile.name.input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm bg-secondary border-border"
                        placeholder="Display name"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="edit-username"
                        className="text-xs text-muted-foreground mb-1 block"
                      >
                        @Username
                      </Label>
                      <Input
                        id="edit-username"
                        data-ocid="profile.username.input"
                        value={editUsername}
                        onChange={(e) =>
                          setEditUsername(e.target.value.replace(/\s/g, ""))
                        }
                        className="h-8 text-sm bg-secondary border-border"
                        placeholder="@username"
                      />
                    </div>
                    {editError && (
                      <p
                        data-ocid="profile.edit.error_state"
                        className="text-xs text-red-400"
                      >
                        {editError}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        data-ocid="profile.save_button"
                        onClick={saveEdit}
                        disabled={isSaving}
                        className="h-8 px-4 text-xs flex-1"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Check className="w-3 h-3 mr-1" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-ocid="profile.cancel_button"
                        onClick={cancelEdit}
                        className="h-8 px-4 text-xs flex-1"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-base font-bold leading-tight truncate">
                        {user.displayName}
                      </p>
                      <button
                        type="button"
                        data-ocid="profile.name.edit_button"
                        onClick={startEdit}
                        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        aria-label="Edit profile"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {user.username && (
                      <p className="text-sm text-muted-foreground truncate">
                        @{user.username}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                      {user.email}
                    </p>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Logged-out state */
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-2xl text-muted-foreground">?</span>
            </div>
            <div>
              <p className="font-semibold">Not signed in</p>
              <p className="text-sm text-muted-foreground">
                Login to upload & interact
              </p>
            </div>
          </div>
        )}
      </div>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Creator Dashboard ── */}
      {user && onCreatorDashboard && (
        <button
          type="button"
          data-ocid="menu.creator_dashboard.button"
          onClick={onCreatorDashboard}
          className="w-full mb-4 flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left shadow-card"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Creator Dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Videos, playlists, community & earnings
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        </button>
      )}

      {/* ── Settings Section ── */}
      <div className="bg-card rounded-2xl overflow-hidden mb-4 shadow-card">
        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Settings
        </p>
        {SETTINGS_ITEMS.map(({ icon: Icon, label, page }, idx) => (
          <div key={label}>
            {idx > 0 && <Separator className="mx-4" />}
            <button
              type="button"
              data-ocid={`settings.${page}.button`}
              onClick={() => onSettingsClick(page)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left"
            >
              <Icon
                className="w-4.5 h-4.5 text-muted-foreground shrink-0"
                size={18}
              />
              <span className="text-sm font-medium flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Spacer pushes logout to bottom ── */}
      <div className="flex-1" />

      {/* ── Footer ── */}
      <p className="text-center text-xs text-muted-foreground mb-4">
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

      {/* ── Logout / Sign In ── */}
      <Separator className="mb-4" />
      {user ? (
        <Button
          variant="ghost"
          data-ocid="menu.logout.button"
          onClick={logout}
          className="w-full h-12 text-red-400 hover:text-red-300 hover:bg-red-500/10 font-semibold text-base gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </Button>
      ) : (
        <Button
          data-ocid="menu.login.button"
          onClick={onLoginClick}
          className="w-full h-12 text-base gap-2 font-semibold"
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
      )}
    </div>
  );
}

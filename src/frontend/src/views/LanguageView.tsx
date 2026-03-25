import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Check, Search } from "lucide-react";
import { useState } from "react";
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

const ALL_LANGUAGES = [
  "Abkhazian",
  "Afar",
  "Afrikaans",
  "Akan",
  "Akkadian",
  "Albanian",
  "American Sign Language",
  "Amharic",
  "Arabic",
  "Aramaic",
  "Armenian",
  "Assamese",
  "Aymara",
  "Azerbaijani",
  "Bambara",
  "Bangla",
  "Bangla (India)",
  "Bashkir",
  "Basque",
  "Belarusian",
  "Bhojpuri",
  "Bislama",
  "Bodo",
  "Bosnian",
  "Breton",
  "Bulgarian",
  "Burmese",
  "Cantonese",
  "Cantonese (Hong Kong)",
  "Catalan",
  "Cherokee",
  "Chinese",
  "Chinese (China)",
  "Chinese (Hong Kong)",
  "Chinese (Simplified)",
  "Chinese (Singapore)",
  "Chinese (Taiwan)",
  "Chinese (Traditional)",
  "Choctaw",
  "Coptic",
  "Corsican",
  "Cree",
  "Croatian",
  "Czech",
  "Danish",
  "Dogri",
  "Dutch",
  "Dutch (Belgium)",
  "Dutch (Netherlands)",
  "Dzongkha",
  "English",
  "English (Australia)",
  "English (Canada)",
  "English (India)",
  "English (Ireland)",
  "English (United Kingdom)",
  "English (United States)",
  "Esperanto",
  "Estonian",
  "Ewe",
  "Faroese",
  "Fijian",
  "Filipino",
  "Finnish",
  "French",
  "French (Belgium)",
  "French (Canada)",
  "French (France)",
  "French (Switzerland)",
  "Fula",
  "Galician",
  "Ganda",
  "Georgian",
  "German",
  "German (Austria)",
  "German (Germany)",
  "German (Switzerland)",
  "Greek",
  "Guarani",
  "Gujarati",
  "Gusii",
  "Haitian Creole",
  "Hakka Chinese",
  "Hakka Chinese (Taiwan)",
  "Haryanvi",
  "Hausa",
  "Hawaiian",
  "Hebrew",
  "Hindi",
  "Hindi (Latin)",
  "Hiri Motu",
  "Hungarian",
  "Icelandic",
  "Igbo",
  "Indonesian",
  "Interlingua",
  "Interlingue",
  "Inuktitut",
  "Inupiaq",
  "Irish",
  "Italian",
  "Japanese",
  "Javanese",
  "Kalaallisut",
  "Kalenjin",
  "Kamba",
  "Kannada",
  "Kashmiri",
  "Kazakh",
  "Khmer",
  "Kikuyu",
  "Kinyarwanda",
  "Klingon",
  "Konkani",
  "Korean",
  "Kurdish",
  "Kyrgyz",
  "Ladino",
  "Lao",
  "Latin",
  "Latvian",
  "Lingala",
  "Lithuanian",
  "Lojban",
  "Lower Sorbian",
  "Luba-Katanga",
  "Luo",
  "Luxembourgish",
  "Luyia",
  "Macedonian",
  "Maithili",
  "Malagasy",
  "Malay",
  "Malay (Singapore)",
  "Malayalam",
  "Maltese",
  "Manipuri",
  "Māori",
  "Marathi",
  "Masai",
  "Meru",
  "Min Nan Chinese",
  "Min Nan Chinese (Taiwan)",
  "Mixe",
  "Mizo",
  "Mongolian",
  "Mongolian (Mongolian)",
  "Nauru",
  "Navajo",
  "Nepali",
  "Nigerian Pidgin",
  "North Ndebele",
  "Northern Sotho",
  "Norwegian",
  "Occitan",
  "Odia",
  "Oromo",
  "Papiamento",
  "Pashto",
  "Persian",
  "Persian (Afghanistan)",
  "Persian (Iran)",
  "Polish",
  "Portuguese",
  "Portuguese (Brazil)",
  "Portuguese (Portugal)",
  "Punjabi",
  "Quechua",
  "Romanian",
  "Romanian (Moldova)",
  "Romansh",
  "Rundi",
  "Russian",
  "Russian (Latin)",
  "Samoan",
  "Sango",
  "Sanskrit",
  "Santali",
  "Sardinian",
  "Scottish Gaelic",
  "Serbian",
  "Serbian (Cyrillic)",
  "Serbian (Latin)",
  "Serbo-Croatian",
  "Sherdukpen",
  "Shona",
  "Sicilian",
  "Sindhi",
  "Sinhala",
  "Slovak",
  "Slovenian",
  "Somali",
  "South Ndebele",
  "Southern Sotho",
  "Spanish",
  "Spanish (Latin America)",
  "Spanish (Mexico)",
  "Spanish (Spain)",
  "Spanish (United States)",
  "Sundanese",
  "Swahili",
  "Swati",
  "Swedish",
  "Tagalog",
  "Tajik",
  "Tamil",
  "Tatar",
  "Telugu",
  "Thai",
  "Tibetan",
  "Tigrinya",
  "Tok Pisin",
  "Toki Pona",
  "Tongan",
  "Tsonga",
  "Tswana",
  "Turkish",
  "Turkmen",
  "Twi",
  "Ukrainian",
  "Upper Sorbian",
  "Urdu",
  "Uyghur",
  "Uzbek",
  "Venda",
  "Vietnamese",
  "Volapük",
  "Võro",
  "Walloon",
  "Welsh",
  "Western Frisian",
  "Wolaytta",
  "Wolof",
  "Xhosa",
  "Yiddish",
  "Yoruba",
  "Zulu",
];

interface LanguageViewProps {
  onBack: () => void;
}

export function LanguageView({ onBack }: LanguageViewProps) {
  const { settings, updateSetting } = useSettings();
  const [search, setSearch] = useState("");

  const preferred = settings.preferredLanguages ?? [];

  const filtered = search.trim()
    ? ALL_LANGUAGES.filter((l) =>
        l.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : ALL_LANGUAGES;

  function toggleLanguage(lang: string) {
    const next = preferred.includes(lang)
      ? preferred.filter((l) => l !== lang)
      : [...preferred, lang];
    updateSetting("preferredLanguages", next);
  }

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

      {/* Preferred Languages */}
      <div className="mt-6 mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 px-1">
          Preferred Languages
        </p>
        <p className="text-xs text-muted-foreground mb-3 px-1">
          Used for subtitles, recommendations, and UI preferences. Leave empty
          to use device default.
        </p>

        <div className="bg-card rounded-2xl overflow-hidden">
          {/* Search bar */}
          <div className="px-4 pt-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                data-ocid="language.search_input"
                type="text"
                placeholder="Search languages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
          </div>

          {/* Selected count */}
          {preferred.length > 0 && (
            <div className="px-4 pb-2">
              <span className="text-xs font-medium text-primary">
                {preferred.length} selected
              </span>
            </div>
          )}

          <Separator />

          {/* Scrollable checklist */}
          <div className="max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No languages match your search.
              </div>
            ) : (
              filtered.map((lang, idx) => {
                const checked = preferred.includes(lang);
                return (
                  <div key={lang}>
                    {idx > 0 && <Separator className="opacity-30" />}
                    <label
                      data-ocid={`language.preferred.item.${idx + 1}`}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/40 active:bg-secondary/60 transition-colors select-none"
                    >
                      {/* Custom checkbox */}
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          checked
                            ? "bg-primary border-primary"
                            : "bg-transparent border-border"
                        }`}
                        aria-hidden="true"
                      >
                        {checked && (
                          <Check
                            className="w-3 h-3 text-primary-foreground"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleLanguage(lang)}
                      />
                      <span
                        className={`text-sm ${checked ? "font-medium text-foreground" : "text-foreground/80"}`}
                      >
                        {lang}
                      </span>
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </SettingsSubPage>
  );
}

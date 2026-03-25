const CATEGORIES = [
  "For You",
  "Following",
  "Gaming",
  "Music",
  "Vlogs",
  "Sports",
  "Tech",
];

interface CategoryTabsProps {
  active: string;
  onChange: (cat: string) => void;
}

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <div
      data-ocid="home.tab"
      className="flex items-center gap-0 overflow-x-auto bg-background border-b border-border"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {CATEGORIES.map((cat) => {
        const isActive = cat === active;
        return (
          <button
            type="button"
            key={cat}
            onClick={() => onChange(cat)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap font-medium shrink-0 border-b-2 transition-colors ${
              isActive
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}

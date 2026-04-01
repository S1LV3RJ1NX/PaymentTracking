import { CATEGORY_COLORS, getCategoryHex } from "../lib/constants";

function formatLabel(category: string): string {
  const label = category.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function CategoryPill({ category }: { category: string }) {
  const known = CATEGORY_COLORS[category];
  if (known) {
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${known.bg} ${known.text}`}
      >
        {formatLabel(category)}
      </span>
    );
  }

  const hex = getCategoryHex(category);
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: hex + "20", color: hex }}
    >
      {formatLabel(category)}
    </span>
  );
}

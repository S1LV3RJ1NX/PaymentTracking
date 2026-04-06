export const EXPENSE_CATEGORIES = [
  "rent",
  "internet",
  "electricity",
  "travel",
  "equipment",
  "currency_fees",
  "professional_fees",
  "gym",
  "healthcare",
  "insurance",
  "hotels",
  "food",
  "software",
  "telephone",
  "office_supplies",
  "transport",
  "education",
  "investment",
  "other",
];

export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  rent: { bg: "bg-blue-100", text: "text-blue-800" },
  internet: { bg: "bg-purple-100", text: "text-purple-800" },
  electricity: { bg: "bg-yellow-100", text: "text-yellow-800" },
  travel: { bg: "bg-teal-100", text: "text-teal-800" },
  equipment: { bg: "bg-orange-100", text: "text-orange-800" },
  currency_fees: { bg: "bg-pink-100", text: "text-pink-800" },
  professional_fees: { bg: "bg-indigo-100", text: "text-indigo-800" },
  gym: { bg: "bg-lime-100", text: "text-lime-800" },
  healthcare: { bg: "bg-rose-100", text: "text-rose-800" },
  insurance: { bg: "bg-cyan-100", text: "text-cyan-800" },
  hotels: { bg: "bg-amber-100", text: "text-amber-800" },
  food: { bg: "bg-emerald-100", text: "text-emerald-800" },
  software: { bg: "bg-violet-100", text: "text-violet-800" },
  telephone: { bg: "bg-sky-100", text: "text-sky-800" },
  office_supplies: { bg: "bg-stone-100", text: "text-stone-800" },
  transport: { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  education: { bg: "bg-blue-100", text: "text-blue-800" },
  investment: { bg: "bg-green-100", text: "text-green-800" },
  other: { bg: "bg-gray-100", text: "text-gray-600" },
};

export const CATEGORY_HEX_COLORS: Record<string, string> = {
  rent: "#3B82F6",
  internet: "#A855F7",
  electricity: "#EAB308",
  travel: "#14B8A6",
  equipment: "#F97316",
  currency_fees: "#EC4899",
  professional_fees: "#6366F1",
  gym: "#84CC16",
  healthcare: "#F43F5E",
  insurance: "#06B6D4",
  hotels: "#F59E0B",
  food: "#10B981",
  software: "#8B5CF6",
  telephone: "#0EA5E9",
  office_supplies: "#78716C",
  transport: "#D946EF",
  education: "#2563EB",
  investment: "#16A34A",
  other: "#9CA3AF",
};

const FALLBACK_COLORS = [
  "#6366F1",
  "#0891B2",
  "#CA8A04",
  "#DC2626",
  "#7C3AED",
  "#059669",
  "#EA580C",
  "#4F46E5",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getCategoryHex(category: string): string {
  return (
    CATEGORY_HEX_COLORS[category] ?? FALLBACK_COLORS[hashCode(category) % FALLBACK_COLORS.length]!
  );
}

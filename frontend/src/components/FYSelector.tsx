interface FYSelectorProps {
  value: string;
  onChange: (fy: string) => void;
}

const FIRST_FY_START = 2025;

function generateFYOptions(): string[] {
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options: string[] = [];
  for (let y = currentFYStart; y >= FIRST_FY_START; y--) {
    const s1 = String(y % 100).padStart(2, "0");
    const s2 = String((y + 1) % 100).padStart(2, "0");
    options.push(`FY${s1}-${s2}`);
  }
  return options;
}

export function FYSelector({ value, onChange }: FYSelectorProps) {
  const options = generateFYOptions();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-thin border-border bg-surface-card text-text focus:ring-accent-blue/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
    >
      {options.map((fy) => (
        <option key={fy} value={fy}>
          {fy}
        </option>
      ))}
    </select>
  );
}

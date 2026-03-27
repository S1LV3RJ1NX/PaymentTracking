interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: "default" | "green" | "red";
}

const VALUE_COLORS = {
  default: "text-text",
  green: "text-accent-green",
  red: "text-accent-red",
};

export function MetricCard({ label, value, subtitle, valueColor = "default" }: MetricCardProps) {
  return (
    <div className="bg-surface-muted rounded-lg p-3.5">
      <div className="text-text-secondary mb-1 text-xs">{label}</div>
      <div className={`text-[21px] font-medium ${VALUE_COLORS[valueColor]}`}>{value}</div>
      {subtitle && <div className="text-text-tertiary mt-1 text-[11px]">{subtitle}</div>}
    </div>
  );
}

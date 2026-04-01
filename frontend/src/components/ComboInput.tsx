export function ComboInput({
  label,
  value,
  options,
  onChange,
  disabled,
  id,
  normalize,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  id: string;
  normalize?: boolean;
}) {
  const listId = `${id}-list`;

  const handleBlur = () => {
    if (!normalize || !value.trim()) return;
    const snake = value.trim().toLowerCase().replace(/\s+/g, "_");
    const match = options.find(
      (opt) => opt.toLowerCase() === snake || opt.toLowerCase() === value.trim().toLowerCase(),
    );
    onChange(match ?? snake);
  };

  return (
    <div>
      {label && <label className="label-uppercase mb-1 block">{label}</label>}
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, " ")}
          </option>
        ))}
      </datalist>
    </div>
  );
}

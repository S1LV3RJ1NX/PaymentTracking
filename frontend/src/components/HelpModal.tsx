import { getStoredRole } from "../api/client";

interface HelpModalProps {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Upload",
    ownerOnly: true,
    items: [
      "Drag-and-drop or tap to select invoices, FIRA certificates, or expense receipts",
      "Claude AI extracts structured data (date, amount, vendor, etc.) automatically",
      "Optionally attach a payment proof (UPI screenshot, bank statement) alongside the main document",
      "Toggle between Business and Non-business for expenses — non-business items are excluded from tax calculations",
      "Share a screenshot directly from your phone's share menu to auto-fill the upload page (PWA Share Target)",
    ],
  },
  {
    title: "Dashboard",
    ownerOnly: false,
    items: [
      "See YTD income, business expenses, and non-business expenses at a glance",
      "Monthly income vs expenses chart tracks your cash flow trend",
      "Client breakdown shows where your revenue comes from",
      "Category breakdown shows where your money goes",
      "All data is filtered by the Financial Year selected in the navbar",
    ],
  },
  {
    title: "Transactions",
    ownerOnly: false,
    items: [
      "Switch between Income and Expenses tabs to view all entries",
      "Use Business / Non-business sub-filter on the Expenses tab",
      "Search bar filters transactions by any field (description, vendor, amount, etc.)",
      "Eye icon — view the uploaded document; shows dual tabs if FIRA or payment proof is linked",
      "Paperclip icon — manually attach a FIRA (Income) or payment proof (Expenses) to an existing entry",
      "Swap arrows icon — move an expense between Business and Non-business categories",
      "Pencil icon — edit any field of a transaction (owner only)",
      "Trash icon — delete a transaction and its linked files (owner only)",
      "Select multiple rows with checkboxes, then bulk-download their files as a ZIP",
    ],
  },
  {
    title: "Tax",
    ownerOnly: false,
    items: [
      "Section 44ADA presumptive taxation — 50% of gross receipts treated as income (if under 75L)",
      "New Regime tax slabs applied automatically based on your income",
      "Section 87A rebate deducted if taxable income qualifies",
      "Advance tax schedule shows quarterly due dates and amounts",
      "Add an estimated annual income to project your full-year tax liability",
    ],
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  const role = getStoredRole();
  const isOwner = role === "owner";
  const visible = SECTIONS.filter((s) => !s.ownerOnly || isOwner);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="border-thin border-border bg-surface-card relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <span className="text-text text-sm font-semibold">How to use this app</span>
          <button
            onClick={onClose}
            className="text-text-secondary hover:bg-surface-muted rounded-md p-1"
            aria-label="Close help"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {visible.map((section) => (
            <div key={section.title} className="mb-5 last:mb-0">
              <h3 className="text-text mb-2 text-sm font-semibold">{section.title}</h3>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="text-text-secondary flex items-start gap-2 text-[13px] leading-snug"
                  >
                    <span className="text-accent-blue mt-0.5 shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border border-t px-5 py-3">
          <button
            onClick={onClose}
            className="bg-text text-surface-card w-full rounded-lg px-3 py-2 text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

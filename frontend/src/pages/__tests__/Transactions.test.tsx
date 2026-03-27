import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { Transactions } from "../Transactions";
import { FYProvider } from "../../context/FYContext";

vi.mock("../../api/transactions", () => ({
  getTransactions: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "Expenses-2",
        rowNum: 2,
        tab: "Expenses",
        values: {
          date: "2026-03-15",
          description: "Internet",
          category: "internet",
          amount_inr: "2000",
          business_pct: "100",
          claimable_inr: "2000",
          paid_via: "upi",
          vendor: "ACT",
          file_key: "FY25-26/Expenses/internet.jpg",
          confidence: "high",
          added_at: "ts",
          payment_file_key: "",
        },
      },
      {
        id: "Expenses-3",
        rowNum: 3,
        tab: "Expenses",
        values: {
          date: "2026-02-10",
          description: "Travel",
          category: "travel",
          amount_inr: "5000",
          business_pct: "100",
          claimable_inr: "5000",
          paid_via: "card",
          vendor: "Uber",
          file_key: "",
          confidence: "low",
          added_at: "ts",
          payment_file_key: "",
        },
      },
    ],
    total: 2,
    months: {
      "2026-03": [
        {
          id: "Expenses-2",
          rowNum: 2,
          tab: "Expenses",
          values: {
            date: "2026-03-15",
            description: "Internet",
            category: "internet",
            amount_inr: "2000",
            business_pct: "100",
            claimable_inr: "2000",
            paid_via: "upi",
            vendor: "ACT",
            file_key: "FY25-26/Expenses/internet.jpg",
            confidence: "high",
            added_at: "ts",
            payment_file_key: "",
          },
        },
      ],
      "2026-02": [
        {
          id: "Expenses-3",
          rowNum: 3,
          tab: "Expenses",
          values: {
            date: "2026-02-10",
            description: "Travel",
            category: "travel",
            amount_inr: "5000",
            business_pct: "100",
            claimable_inr: "5000",
            paid_via: "card",
            vendor: "Uber",
            file_key: "",
            confidence: "low",
            added_at: "ts",
            payment_file_key: "",
          },
        },
      ],
    },
  }),
  updateTransaction: vi.fn().mockResolvedValue(undefined),
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
  moveTransaction: vi.fn().mockResolvedValue({ business_pct: "0", claimable_inr: "0" }),
  attachPayment: vi.fn().mockResolvedValue({ paymentFileKey: "key" }),
  attachFira: vi.fn().mockResolvedValue({ firaFileKey: "key" }),
  downloadFiles: vi.fn().mockResolvedValue(new Blob()),
}));

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn(), post: vi.fn() },
  getStoredRole: vi.fn().mockReturnValue("owner"),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <BrowserRouter>
      <FYProvider>
        <Transactions />
      </FYProvider>
    </BrowserRouter>,
  );
}

describe("Transactions page", () => {
  it("renders Income and Expenses tabs", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Income")).toBeInTheDocument();
      expect(screen.getByText("Expenses")).toBeInTheDocument();
    });
  });

  it("renders month headers", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Mar 2026")).toBeInTheDocument();
      expect(screen.getByText("Feb 2026")).toBeInTheDocument();
    });
  });

  it("shows review badge for low-confidence rows", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("review")).toBeInTheDocument();
      expect(screen.getByText("confirmed")).toBeInTheDocument();
    });
  });

  it("shows edit and delete buttons for owner", async () => {
    renderPage();
    await waitFor(() => {
      const editButtons = screen.getAllByLabelText("Edit");
      expect(editButtons.length).toBeGreaterThan(0);
      const deleteButtons = screen.getAllByLabelText("Delete");
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  it("hides edit/delete for CA role", async () => {
    const { getStoredRole } = await import("../../api/client");
    vi.mocked(getStoredRole).mockReturnValue("ca");

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Internet")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("shows total count", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
    });
  });

  it("switches tabs", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Income")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Income"));
  });

  it("renders business/non-business sub-toggle", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Business")).toBeInTheDocument();
      expect(screen.getByText("Non-business")).toBeInTheDocument();
    });
  });

  it("renders search input", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search transactions...")).toBeInTheDocument();
    });
  });

  it("renders checkboxes for bulk selection", async () => {
    renderPage();
    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  it("shows move button for expenses", async () => {
    renderPage();
    await waitFor(() => {
      const moveButtons = screen.getAllByLabelText(/Move to/);
      expect(moveButtons.length).toBeGreaterThan(0);
    });
  });
});

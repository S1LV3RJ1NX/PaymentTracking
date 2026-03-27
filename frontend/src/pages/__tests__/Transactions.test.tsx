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
          confidence: "high",
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
          confidence: "low",
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
            confidence: "high",
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
            confidence: "low",
          },
        },
      ],
    },
  }),
  updateTransaction: vi.fn().mockResolvedValue(undefined),
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
      const editButtons = screen.getAllByTitle("Edit");
      expect(editButtons.length).toBeGreaterThan(0);
      const deleteButtons = screen.getAllByTitle("Delete");
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
    expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
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
});

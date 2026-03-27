import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Dashboard } from "../Dashboard";
import { FYProvider } from "../../context/FYContext";

vi.mock("../../api/dashboard", () => ({
  getDashboardSummary: vi.fn().mockResolvedValue({
    fy: "FY25-26",
    income: { ytd_inr: 672000, by_client: { "Client A": 419000, "Client B": 253000 } },
    expenses: { ytd_claimable: 7000, by_category: { internet: 2000, travel: 5000 } },
    non_business_expenses: 3000,
    review_count: 3,
  }),
  getMonthlyBreakdown: vi.fn().mockResolvedValue({
    fy: "FY25-26",
    months: [
      { month: "2026-01", income: 419000, expenses: 2000 },
      { month: "2026-02", income: 253000, expenses: 5000 },
    ],
  }),
}));

vi.mock("../../api/client", () => ({
  api: { get: vi.fn() },
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
        <Dashboard />
      </FYProvider>
    </BrowserRouter>,
  );
}

describe("Dashboard page", () => {
  it("renders metric cards", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("YTD Income")).toBeInTheDocument();
      expect(screen.getByText("Business Expenses")).toBeInTheDocument();
      expect(screen.getByText("Non-business Expenses")).toBeInTheDocument();
      expect(screen.getByText("Needs Review")).toBeInTheDocument();
    });
  });

  it("shows review count", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("renders client breakdown", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Client A")).toBeInTheDocument();
      expect(screen.getByText("Client B")).toBeInTheDocument();
    });
  });

  it("shows chart title", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Monthly Income vs Expenses")).toBeInTheDocument();
    });
  });

  it("renders quick link buttons", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Upload Document")).toBeInTheDocument();
      expect(screen.getByText("View Transactions")).toBeInTheDocument();
    });
  });
});

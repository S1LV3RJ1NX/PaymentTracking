import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { TaxBucket } from "../TaxBucket";
import { FYProvider } from "../../context/FYContext";

vi.mock("../../api/tax", () => ({
  getTaxEstimate: vi.fn(),
  saveTaxEstimate: vi.fn(),
}));

vi.mock("../../api/dashboard", () => ({
  getDashboardSummary: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <BrowserRouter>
      <FYProvider>
        <TaxBucket />
      </FYProvider>
    </BrowserRouter>,
  );
}

describe("TaxBucket page – no estimate saved", () => {
  beforeEach(async () => {
    const { getTaxEstimate } = await import("../../api/tax");
    const { getDashboardSummary } = await import("../../api/dashboard");
    vi.mocked(getTaxEstimate).mockResolvedValue(null);
    vi.mocked(getDashboardSummary).mockRejectedValue(new Error("no data"));
  });

  it("renders the heading and FY selector", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Tax Planner")).toBeInTheDocument();
    });
    expect(screen.getByText(/Estimated Annual Earnings/)).toBeInTheDocument();
  });

  it("shows instruction text when no estimate set", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Enter your estimated gross income/)).toBeInTheDocument();
    });
  });

  it("does not show slab table before estimate is entered", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Tax Planner")).toBeInTheDocument();
    });
    expect(screen.queryByText("Slab-wise Tax")).not.toBeInTheDocument();
  });
});

describe("TaxBucket page – 44ADA (₹25L, under ₹75L limit)", () => {
  beforeEach(async () => {
    const { getTaxEstimate } = await import("../../api/tax");
    const { getDashboardSummary } = await import("../../api/dashboard");
    vi.mocked(getTaxEstimate).mockResolvedValue(2500000);
    vi.mocked(getDashboardSummary).mockResolvedValue({
      fy: "FY25-26",
      income: { ytd_inr: 800000, by_client: {} },
      expenses: { ytd_claimable: 0, by_category: {} },
      non_business_expenses: 0,
      non_business_by_category: {},
      review_count: 0,
    });
  });

  it("shows 44ADA presumptive indicator", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sec 44ADA")).toBeInTheDocument();
    });
    expect(screen.getByText("Presumptive taxation applies")).toBeInTheDocument();
    expect(screen.getByText(/only 50%/)).toBeInTheDocument();
  });

  it("renders all 4 metric cards including Taxable Income", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Gross Receipts")).toBeInTheDocument();
    });
    expect(screen.getByText("Taxable Income")).toBeInTheDocument();
    expect(screen.getByText("50% under 44ADA")).toBeInTheDocument();
    expect(screen.getAllByText("Total Tax").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Net In Hand")).toBeInTheDocument();
  });

  it("renders slab table with both New Regime and 44ADA badges", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("New Regime")).toBeInTheDocument();
    });
    expect(screen.getAllByText("44ADA").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the 50% deemed profit row in slab section", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/→ 50% =/)).toBeInTheDocument();
    });
  });

  it("shows YTD progress bar", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("YTD Progress")).toBeInTheDocument();
    });
    expect(screen.getByText(/Earned/)).toBeInTheDocument();
  });

  it("renders advance tax schedule with 4 deadlines", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Advance Tax Schedule")).toBeInTheDocument();
    });
    const deadlineTexts = screen.getAllByText(/15 (Jun|Sep|Dec|Mar)/);
    expect(deadlineTexts).toHaveLength(4);
  });

  it("shows cess line item", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Health & education cess 4%/)).toBeInTheDocument();
    });
  });

  it("effective rate note mentions 44ADA", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/50% deemed profit under Sec 44ADA/)).toBeInTheDocument();
    });
  });
});

describe("TaxBucket page – 44ADA + 87A rebate (₹20L, taxable ₹10L ≤ ₹12L)", () => {
  beforeEach(async () => {
    const { getTaxEstimate } = await import("../../api/tax");
    const { getDashboardSummary } = await import("../../api/dashboard");
    vi.mocked(getTaxEstimate).mockResolvedValue(2000000);
    vi.mocked(getDashboardSummary).mockResolvedValue({
      fy: "FY25-26",
      income: { ytd_inr: 600000, by_client: {} },
      expenses: { ytd_claimable: 0, by_category: {} },
      non_business_expenses: 0,
      non_business_by_category: {},
      review_count: 0,
    });
  });

  it("shows both 44ADA and 87A Rebate badges", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sec 44ADA")).toBeInTheDocument();
    });
    expect(screen.getByText("87A Rebate")).toBeInTheDocument();
  });

  it("shows zero tax message", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/makes tax zero/)).toBeInTheDocument();
    });
  });

  it("shows 87A rebate line item in breakdown", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sec 87A rebate")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/income ≤ ₹12L/).length).toBeGreaterThanOrEqual(1);
  });

  it("Total Tax metric card shows ₹0 in green", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("87A rebate applied")).toBeInTheDocument();
    });
  });

  it("shows zero tax note instead of effective rate", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Zero tax! Sec 87A rebate/)).toBeInTheDocument();
    });
  });
});

describe("TaxBucket page – Regular (₹1Cr, above ₹75L limit)", () => {
  beforeEach(async () => {
    const { getTaxEstimate } = await import("../../api/tax");
    const { getDashboardSummary } = await import("../../api/dashboard");
    vi.mocked(getTaxEstimate).mockResolvedValue(10000000);
    vi.mocked(getDashboardSummary).mockResolvedValue({
      fy: "FY25-26",
      income: { ytd_inr: 4000000, by_client: {} },
      expenses: { ytd_claimable: 0, by_category: {} },
      non_business_expenses: 0,
      non_business_by_category: {},
      review_count: 0,
    });
  });

  it("shows Regular indicator instead of 44ADA", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Regular")).toBeInTheDocument();
    });
    expect(screen.getByText("Full gross is taxable")).toBeInTheDocument();
    expect(screen.queryByText("Sec 44ADA")).not.toBeInTheDocument();
  });

  it("shows Taxable Income as full gross", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Taxable Income")).toBeInTheDocument();
    });
    expect(screen.getByText("Full gross")).toBeInTheDocument();
  });

  it("shows surcharge for income above ₹50L", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Surcharge/)).toBeInTheDocument();
    });
  });

  it("note says no deductions", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no deductions/i)).toBeInTheDocument();
    });
  });
});

describe("TaxBucket page – saving estimate", () => {
  it("calls saveTaxEstimate on Save button click", async () => {
    const { getTaxEstimate, saveTaxEstimate } = await import("../../api/tax");
    const { getDashboardSummary } = await import("../../api/dashboard");
    vi.mocked(getTaxEstimate).mockResolvedValue(null);
    vi.mocked(getDashboardSummary).mockRejectedValue(new Error("no data"));
    vi.mocked(saveTaxEstimate).mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. 2500000")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("e.g. 2500000");
    fireEvent.change(input, { target: { value: "3000000" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(saveTaxEstimate).toHaveBeenCalledWith(expect.any(String), 3000000);
    });
  });
});

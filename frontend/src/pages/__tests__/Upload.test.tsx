import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Upload } from "../Upload";

vi.mock("../../api/upload", () => ({
  extractFile: vi.fn(),
  confirmUpload: vi.fn(),
  cancelUpload: vi.fn(),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: vi.fn().mockImplementation(({ onDrop }) => ({
    getRootProps: () => ({
      onClick: () => {
        const file = new File(["test"], "test.pdf", { type: "application/pdf" });
        onDrop([file]);
      },
    }),
    getInputProps: () => ({}),
    isDragActive: false,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Upload page", () => {
  it("renders all upload type buttons", () => {
    render(<Upload />);

    expect(screen.getByText("Skydo Invoice")).toBeInTheDocument();
    expect(screen.getByText("FIRA / BIRC")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("renders drop zones with prompt text", () => {
    render(<Upload />);

    const dropzones = screen.getAllByText("Tap to select or drop file");
    expect(dropzones.length).toBeGreaterThanOrEqual(1);
  });

  it("shows description field for expense type", () => {
    render(<Upload />);

    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("hides description field for skydo_invoice type", async () => {
    const user = userEvent.setup();
    render(<Upload />);

    await user.click(screen.getByText("Skydo Invoice"));

    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it("shows Upload & Extract button disabled when no file", () => {
    render(<Upload />);

    const btn = screen.getByRole("button", { name: /upload & extract/i });
    expect(btn).toBeDisabled();
  });

  it("shows editable review form after extraction", async () => {
    const { extractFile } = await import("../../api/upload");
    vi.mocked(extractFile).mockResolvedValueOnce({
      success: true,
      data: {
        status: "confirmed",
        uploadType: "expense",
        extracted: {
          vendor: "Test Shop",
          amount_inr: 2000,
          date: "2026-03-26",
          category: "other",
          payment_method: "upi",
          description: "Test expense",
          confidence: "high",
        },
        fileKey: "FY25-26/Expenses/2026-03/other_20260326_test.jpg",
      },
    });

    const user = userEvent.setup();
    render(<Upload />);

    const dropzones = screen.getAllByText("Tap to select or drop file");
    await user.click(dropzones[0]!);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirm & Save")).toBeInTheDocument();
    });

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-03-26")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Shop")).toBeInTheDocument();
  });

  it("shows error message on extraction failure", async () => {
    const { extractFile } = await import("../../api/upload");
    vi.mocked(extractFile).mockRejectedValueOnce(new Error("OCR failed"));

    const user = userEvent.setup();
    render(<Upload />);

    const dropzones = screen.getAllByText("Tap to select or drop file");
    await user.click(dropzones[0]!);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Failed to process document. Please try again.")).toBeInTheDocument();
    });
  });

  it("saves after confirm and shows success", async () => {
    const { extractFile, confirmUpload } = await import("../../api/upload");
    vi.mocked(extractFile).mockResolvedValueOnce({
      success: true,
      data: {
        status: "confirmed",
        uploadType: "expense",
        extracted: {
          vendor: "Shop",
          amount_inr: 100,
          date: "2026-03-26",
          category: "other",
          confidence: "high",
        },
        fileKey: "FY25-26/Expenses/other.pdf",
      },
    });
    vi.mocked(confirmUpload).mockResolvedValueOnce({
      success: true,
      data: {
        uploadType: "expense",
        fileKey: "FY25-26/Expenses/other.pdf",
        rowNum: 3,
      },
    });

    const user = userEvent.setup();
    render(<Upload />);

    const dropzones = screen.getAllByText("Tap to select or drop file");
    await user.click(dropzones[0]!);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirm & Save")).toBeInTheDocument();
    });

    const confirmBtn = screen.getByText("Confirm & Save");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("saved")).toBeInTheDocument();
    });

    expect(screen.getByText(/Saved as:/)).toBeInTheDocument();
  });

  it("resets state when 'Upload another' is clicked after success", async () => {
    const { extractFile, confirmUpload } = await import("../../api/upload");
    vi.mocked(extractFile).mockResolvedValueOnce({
      success: true,
      data: {
        status: "confirmed",
        uploadType: "expense",
        extracted: {
          vendor: "Shop",
          amount_inr: 100,
          date: "2026-03-26",
          category: "other",
          confidence: "high",
        },
        fileKey: "FY25-26/Expenses/other.pdf",
      },
    });
    vi.mocked(confirmUpload).mockResolvedValueOnce({
      success: true,
      data: {
        uploadType: "expense",
        fileKey: "FY25-26/Expenses/other.pdf",
        rowNum: 3,
      },
    });

    const user = userEvent.setup();
    render(<Upload />);

    const dropzones = screen.getAllByText("Tap to select or drop file");
    await user.click(dropzones[0]!);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirm & Save")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Confirm & Save"));

    await waitFor(() => {
      expect(screen.getByText("saved")).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole("button", { name: /upload another/i });
    await user.click(resetBtn);

    const newDropzones = screen.getAllByText("Tap to select or drop file");
    expect(newDropzones.length).toBeGreaterThanOrEqual(1);
  });

  it("shows business/non-business toggle for expense type", () => {
    render(<Upload />);

    expect(screen.getByText("Business")).toBeInTheDocument();
    expect(screen.getByText("Non-business")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Upload } from "../Upload";

vi.mock("../../api/upload", () => ({
  uploadFile: vi.fn(),
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

  it("renders the drop zone with prompt text", () => {
    render(<Upload />);

    expect(screen.getByText("Tap to select or drop file")).toBeInTheDocument();
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

  it("shows result card after successful upload", async () => {
    const { uploadFile } = await import("../../api/upload");
    vi.mocked(uploadFile).mockResolvedValueOnce({
      success: true,
      data: {
        status: "confirmed",
        uploadType: "expense",
        extracted: {
          vendor: "Test Shop",
          amount_inr: 2000,
          date: "2026-03-26",
          category: "other",
        },
        fileKey: "FY25-26/Expenses/2026-03/other_20260326_test.jpg",
        rowNum: 5,
      },
    });

    const user = userEvent.setup();
    render(<Upload />);

    // Select file via our mock dropzone
    const dropzone = screen.getByText("Tap to select or drop file");
    await user.click(dropzone);

    // Submit
    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("confirmed")).toBeInTheDocument();
    });

    expect(screen.getByText("Test Shop")).toBeInTheDocument();
    expect(screen.getByText(/Saved as:/)).toBeInTheDocument();
  });

  it("shows error message on upload failure", async () => {
    const { uploadFile } = await import("../../api/upload");
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error("OCR failed"));

    const user = userEvent.setup();
    render(<Upload />);

    const dropzone = screen.getByText("Tap to select or drop file");
    await user.click(dropzone);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Failed to upload document. Please try again.")).toBeInTheDocument();
    });
  });

  it("resets state when 'Upload another' is clicked", async () => {
    const { uploadFile } = await import("../../api/upload");
    vi.mocked(uploadFile).mockResolvedValueOnce({
      success: true,
      data: {
        status: "confirmed",
        uploadType: "expense",
        extracted: { vendor: "Shop", amount_inr: 100 },
        fileKey: "FY25-26/Expenses/other.pdf",
        rowNum: 3,
      },
    });

    const user = userEvent.setup();
    render(<Upload />);

    const dropzone = screen.getByText("Tap to select or drop file");
    await user.click(dropzone);

    const submitBtn = screen.getByRole("button", { name: /upload & extract/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("confirmed")).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole("button", { name: /upload another/i });
    await user.click(resetBtn);

    expect(screen.getByText("Tap to select or drop file")).toBeInTheDocument();
  });
});

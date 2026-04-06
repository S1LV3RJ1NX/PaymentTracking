import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DropZone } from "../DropZone";

vi.mock("react-dropzone", () => ({
  useDropzone: vi.fn().mockImplementation(() => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  })),
}));

describe("DropZone", () => {
  it("shows prompt when no file selected", () => {
    render(<DropZone onFileSelected={vi.fn()} currentFile={null} />);

    expect(screen.getByText("Tap to select or drop file")).toBeInTheDocument();
    expect(screen.getByText("PDF, JPEG, PNG, or WebP — up to 10 MB each")).toBeInTheDocument();
  });

  it("shows file info when file is selected", () => {
    const file = new File(["test content"], "receipt.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: 1024 * 500 });

    render(<DropZone onFileSelected={vi.fn()} currentFile={file} />);

    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
    expect(screen.getByText("500.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Tap to change")).toBeInTheDocument();
  });

  it("applies disabled styling", () => {
    const { container } = render(<DropZone onFileSelected={vi.fn()} currentFile={null} disabled />);

    const zone = container.firstElementChild;
    expect(zone?.className).toContain("opacity-60");
  });
});

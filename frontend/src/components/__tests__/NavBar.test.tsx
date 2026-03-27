import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { NavBar } from "../NavBar";
import { FYProvider } from "../../context/FYContext";

vi.mock("../../api/client", () => ({
  getStoredRole: vi.fn().mockReturnValue("owner"),
  logout: vi.fn(),
}));

function renderNavBar() {
  return render(
    <BrowserRouter>
      <FYProvider>
        <NavBar />
      </FYProvider>
    </BrowserRouter>,
  );
}

describe("NavBar", () => {
  it("renders all navigation links in desktop view", () => {
    renderNavBar();
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Upload").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Transactions").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tax").length).toBeGreaterThanOrEqual(1);
  });

  it("renders FY selector", () => {
    renderNavBar();
    expect(screen.getByDisplayValue(/^FY\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it("has hamburger menu button", () => {
    renderNavBar();
    expect(screen.getByLabelText("Toggle menu")).toBeInTheDocument();
  });

  it("opens mobile menu on hamburger click", () => {
    renderNavBar();
    const hamburger = screen.getByLabelText("Toggle menu");
    fireEvent.click(hamburger);
    const logoutButtons = screen.getAllByText("Logout");
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show Read Only badge for owner", () => {
    renderNavBar();
    expect(screen.queryByText("Read Only")).not.toBeInTheDocument();
  });

  it("shows Read Only badge for CA role", async () => {
    const { getStoredRole } = await import("../../api/client");
    vi.mocked(getStoredRole).mockReturnValue("ca");

    renderNavBar();
    expect(screen.getAllByText("Read Only").length).toBeGreaterThanOrEqual(1);
  });
});

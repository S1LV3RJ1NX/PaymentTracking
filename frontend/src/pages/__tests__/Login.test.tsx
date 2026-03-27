import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../api/client", () => ({
  api: {
    post: vi.fn(),
  },
  isAuthenticated: () => false,
}));

import { api } from "../../api/client";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Login page", () => {
  function renderLogin() {
    return render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  }

  it("renders the login form with username dropdown", () => {
    renderLogin();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText("Prathamesh")).toBeInTheDocument();
    expect(screen.getByText("Kothari CA")).toBeInTheDocument();
  });

  it("logs in successfully and navigates to dashboard", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { success: true, data: { token: "test-jwt", role: "owner" } },
    });

    renderLogin();

    await user.selectOptions(screen.getByLabelText(/username/i), "prathamesh");
    await user.type(screen.getByLabelText(/password/i), "test-pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem("token")).toBe("test-jwt");
      expect(localStorage.getItem("role")).toBe("owner");
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error on failed login", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(new Error("401"));

    renderLogin();

    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
  });
});

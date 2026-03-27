import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("prathamesh");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { username, password });
      const { token, role } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-text mb-8 text-center text-xl font-semibold tracking-tight">
          Business Expense Tracker
        </h1>

        <div className="border-thin border-border bg-surface-card rounded-xl px-6 py-8">
          <h2 className="text-text mb-6 text-lg font-medium">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="label-uppercase mb-1.5 block">
                Username
              </label>
              <select
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-thin border-border bg-surface text-text focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              >
                <option value="prathamesh">Prathamesh</option>
                <option value="kothari_ca">Kothari CA</option>
              </select>
            </div>

            <div>
              <label htmlFor="password" className="label-uppercase mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-thin border-border bg-surface text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              />
            </div>

            {error && <p className="text-accent-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="bg-text text-surface-card w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

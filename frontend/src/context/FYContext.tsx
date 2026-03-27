import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

function getCurrentFY(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const fyStart = month >= 3 ? year : year - 1;
  const s1 = String(fyStart % 100).padStart(2, "0");
  const s2 = String((fyStart + 1) % 100).padStart(2, "0");
  return `FY${s1}-${s2}`;
}

interface FYContextValue {
  fy: string;
  setFy: (fy: string) => void;
}

const FYContext = createContext<FYContextValue | null>(null);

export function FYProvider({ children }: { children: ReactNode }) {
  const [fy, setFy] = useState(getCurrentFY);
  return <FYContext.Provider value={{ fy, setFy }}>{children}</FYContext.Provider>;
}

export function useFY(): FYContextValue {
  const ctx = useContext(FYContext);
  if (!ctx) throw new Error("useFY must be used within FYProvider");
  return ctx;
}

import { api } from "./client";

export async function getTaxEstimate(fy: string): Promise<number | null> {
  const res = await api.get<{ success: true; data: { estimated_annual: number | null } }>(
    `/tax/estimate?fy=${fy}`,
  );
  return res.data.data.estimated_annual;
}

export async function saveTaxEstimate(fy: string, estimated_annual: number): Promise<void> {
  await api.put("/tax/estimate", { fy, estimated_annual });
}

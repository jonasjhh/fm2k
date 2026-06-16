import { calculateOverall, getTeamOVR } from '@fm2k/match';

// getTeamOVR now lives in @fm2k/match; re-exported here for back-compat.
export { getTeamOVR };

export function sellPrice(attrs: Parameters<typeof calculateOverall>[0]): number {
  return Math.max(1_000, Math.round(calculateOverall(attrs)) * 5_000);
}

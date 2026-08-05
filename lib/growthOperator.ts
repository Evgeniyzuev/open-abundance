export function isGrowthOperator(userId: string): boolean {
  const configuredIds = (process.env.GROWTH_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredIds.includes(userId);
}

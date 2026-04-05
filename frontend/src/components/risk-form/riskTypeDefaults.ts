interface RiskTypeOption {
  code: string;
}

export function resolveRiskTypeCode(
  riskType: string | null | undefined,
  riskTypes: RiskTypeOption[],
): string {
  if (riskType && riskTypes.some((option) => option.code === riskType)) {
    return riskType;
  }

  if (riskTypes.length > 0) {
    return riskTypes[0].code;
  }

  return riskType ?? 'operational';
}

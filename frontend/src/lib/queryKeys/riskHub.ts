export const riskHubKeys = {
    capabilities: () => ['riskHubCapabilities'] as const,
    globalConfig: () => ['globalConfig'] as const,
    departments: () => ['departments'] as const,
    roles: (activeOnly?: boolean) => (
        activeOnly === undefined
            ? ['roles'] as const
            : ['roles', activeOnly] as const
    ),
    permissions: () => ['permissions'] as const,
    riskTypes: () => ['riskTypes'] as const,
    approvalScenarios: () => ['approvalScenarios'] as const,
    publicRiskTypes: () => ['riskHub', 'publicRiskTypes'] as const,
    thresholdsPublic: () => ['riskHub', 'thresholds', 'public'] as const,
    totalAssetsValue: () => ['riskHub', 'config', 'total_assets_value'] as const,
};

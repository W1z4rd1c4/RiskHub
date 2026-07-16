export const ictRegisterKeys = {
    closedLists: () => ['ictRegister', 'closedLists'] as const,
    vendorOwnerLookup: (search = '') => ['ictRegister', 'vendorOwnerLookup', search] as const,
    assetOwnerLookup: (role: 'business_owner' | 'ict_owner', search = '') =>
        ['ictRegister', 'assetOwnerLookup', role, search] as const,
    assetDepartmentLookup: (search = '') => ['ictRegister', 'assetDepartmentLookup', search] as const,
    assetProcessLinks: (assetId: number) => ['ictRegister', 'assetProcessLinks', assetId] as const,
    assetAssetLinks: (assetId: number) => ['ictRegister', 'assetAssetLinks', assetId] as const,
    assetVendorLinks: (assetId: number) => ['ictRegister', 'assetVendorLinks', assetId] as const,
    processVendorLinks: (processId: number) => ['ictRegister', 'processVendorLinks', processId] as const,
    vendorAssetLinks: (vendorId: number) => ['ictRegister', 'vendorAssetLinks', vendorId] as const,
    vendorProcessLinks: (vendorId: number) => ['ictRegister', 'vendorProcessLinks', vendorId] as const,
    threatRiskLinks: (threatId: number) => ['ictRegister', 'threatRiskLinks', threatId] as const,
    riskThreatLinks: (riskId: number) => ['ictRegister', 'riskThreatLinks', riskId] as const,
    riskProcessLinks: (riskId: number) => ['ictRegister', 'riskProcessLinks', riskId] as const,
    riskAssetLinks: (riskId: number) => ['ictRegister', 'riskAssetLinks', riskId] as const,
    // Option pickers are search-driven (server-side `search` param); the
    // debounced term is part of the key so each page of matches is cached.
    processOptions: (search = '') => ['ictRegister', 'processOptions', search] as const,
    assetOptions: (search = '') => ['ictRegister', 'assetOptions', search] as const,
    vendorOptions: (search = '') => ['ictRegister', 'vendorOptions', search] as const,
    threatOptions: (search = '') => ['ictRegister', 'threatOptions', search] as const,
    riskOptions: (search = '') => ['ictRegister', 'riskOptions', search] as const,
    vendorContracts: (vendorId: number) => ['ictRegister', 'vendorContracts', vendorId] as const,
    vendorSubOutsourcing: (vendorId: number) => ['ictRegister', 'vendorSubOutsourcing', vendorId] as const,
    ictServiceTaxonomy: () => ['ictRegister', 'ictServiceTaxonomy'] as const,
};

export const ictRegisterKeys = {
    closedLists: () => ['ictRegister', 'closedLists'] as const,
    assetProcessLinks: (assetId: number) => ['ictRegister', 'assetProcessLinks', assetId] as const,
    assetAssetLinks: (assetId: number) => ['ictRegister', 'assetAssetLinks', assetId] as const,
    processOptions: () => ['ictRegister', 'processOptions'] as const,
    assetOptions: () => ['ictRegister', 'assetOptions'] as const,
    vendorContracts: (vendorId: number) => ['ictRegister', 'vendorContracts', vendorId] as const,
};

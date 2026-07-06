export function resolveCapability(backendValue: boolean | null | undefined): boolean {
    return backendValue === true;
}

export function resolveCapabilityFlag<T extends object, K extends keyof T>(
    capabilities: T | null | undefined,
    key: K,
): boolean {
    return resolveCapability(capabilities?.[key] as boolean | null | undefined);
}

interface ArchiveCapabilities {
    can_archive_immediately: boolean;
    can_request_archive_approval: boolean;
}

export function canArchive<T extends ArchiveCapabilities>(
    capabilities: T | null | undefined,
): boolean {
    return (
        resolveCapabilityFlag(capabilities, 'can_archive_immediately')
        || resolveCapabilityFlag(capabilities, 'can_request_archive_approval')
    );
}

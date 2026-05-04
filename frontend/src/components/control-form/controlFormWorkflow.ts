export function buildControlOwnerOptionLabel(name: string | null | undefined): string {
    return name?.trim() || 'Unknown user';
}

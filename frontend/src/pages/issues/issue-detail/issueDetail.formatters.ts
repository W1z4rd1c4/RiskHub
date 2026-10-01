export function exceptionActorName(
    requestedByName: string | null,
    approvedByName: string | null,
    unknownUserLabel: string,
): string {
    if (approvedByName) {
        return approvedByName;
    }
    if (requestedByName) {
        return requestedByName;
    }
    return unknownUserLabel;
}

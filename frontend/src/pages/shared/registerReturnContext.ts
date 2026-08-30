function hasControlCharacter(value: string): boolean {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}

const DEPARTMENT_REGISTER_TABS = new Set([
    'risks',
    'controls',
    'kris',
    'issues',
    'processes',
    'assets',
    'vendors',
]);

function isExpectedDepartmentRegister(
    rawPath: string,
    url: URL,
    expectedListPath: `/${string}`,
): boolean {
    const expectedTab = expectedListPath.slice(1);
    const rawTabParams = url.search.slice(1).split('&').filter((param) => param.startsWith('tab='));
    return /^\/departments\/[1-9]\d*$/.test(rawPath)
        && url.pathname === rawPath
        && DEPARTMENT_REGISTER_TABS.has(expectedTab)
        && url.searchParams.getAll('tab').length === 1
        && rawTabParams.length === 1
        && rawTabParams[0] === `tab=${expectedTab}`;
}

export function resolveRegisterReturnTo(
    rawDestination: string | null | undefined,
    expectedListPath: `/${string}`,
): string {
    const destination = rawDestination?.trim();
    const rawPath = destination?.split(/[?#]/, 1)[0] ?? '';
    if (!destination || hasControlCharacter(destination)) {
        return expectedListPath;
    }

    try {
        const url = new URL(destination, 'https://riskhub.invalid');
        const isExpectedList = rawPath === expectedListPath && url.pathname === expectedListPath;
        if (
            url.origin !== 'https://riskhub.invalid'
            || (!isExpectedList && !isExpectedDepartmentRegister(rawPath, url, expectedListPath))
        ) {
            return expectedListPath;
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return expectedListPath;
    }
}

export function appendRegisterReturnTo(target: string, returnTo: string): string {
    const separator = target.includes('?') ? '&' : '?';
    return `${target}${separator}return_to=${encodeURIComponent(returnTo)}`;
}

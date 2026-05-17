import type { Response } from '@playwright/test';

type ExpectedCollectionQuery = Record<string, string | number | boolean | undefined>;

export function collectionQueryValue(url: URL, key: string): string {
    const directValue = url.searchParams.get(key);
    if (directValue !== null) {
        return directValue;
    }

    const filters = url.searchParams.get('filters');
    if (!filters) {
        return '';
    }

    try {
        const parsed = JSON.parse(filters) as Record<string, unknown>;
        const value = parsed[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return '';
    } catch {
        return '';
    }
}

export function matchesCollectionResponse(
    response: Response,
    apiPath: string,
    expected: ExpectedCollectionQuery = {},
): boolean {
    if (response.request().method() !== 'GET') {
        return false;
    }
    if (!response.url().includes(apiPath)) {
        return false;
    }

    try {
        const url = new URL(response.url());
        return Object.entries(expected).every(([key, expectedValue]) => {
            if (expectedValue === undefined) {
                return true;
            }
            const actualValue = collectionQueryValue(url, key).trim().toLowerCase();
            return actualValue.includes(String(expectedValue).trim().toLowerCase());
        });
    } catch {
        return false;
    }
}

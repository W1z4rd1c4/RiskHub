import { getErrorMessageKey } from '@/i18n/errorMessageKey';

import { ApiClientError, parseErrorMessage } from './apiErrors';
import type { ApiClientErrorPayload } from './apiTypes';
import type { z } from './schemas/common';

const MAX_RAW_MESSAGE_LENGTH = 500;

type ParsedResponseBody = {
    hasBody: boolean;
    isJson: boolean;
    json: unknown;
    text: string;
};

function truncateRawMessage(value: string): string {
    if (value.length <= MAX_RAW_MESSAGE_LENGTH) {
        return value;
    }
    return `${value.slice(0, MAX_RAW_MESSAGE_LENGTH - 3)}...`;
}

function invalidResponseError(rawMessage: string, status?: number): ApiClientError {
    return new ApiClientError({
        status,
        code: 'INVALID_RESPONSE_PAYLOAD',
        messageKey: getErrorMessageKey('REQUEST_FAILED'),
        rawMessage: truncateRawMessage(rawMessage),
    });
}

export async function readResponseBody(response: Response): Promise<ParsedResponseBody> {
    const text = await response.text();
    if (text.trim() === '') {
        return {
            hasBody: false,
            isJson: false,
            json: undefined,
            text,
        };
    }

    try {
        return {
            hasBody: true,
            isJson: true,
            json: JSON.parse(text) as unknown,
            text,
        };
    } catch {
        return {
            hasBody: true,
            isJson: false,
            json: undefined,
            text,
        };
    }
}

export function parseBodyWithSchema<S extends z.ZodTypeAny>(
    body: ParsedResponseBody,
    schema: S,
    status?: number,
): z.infer<S> {
    if (body.hasBody && !body.isJson) {
        throw invalidResponseError(
            `Expected JSON response body but received non-JSON content: ${body.text}`,
            status,
        );
    }

    const candidate = body.hasBody ? body.json : undefined;
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
        throw invalidResponseError(
            `Response payload did not match expected schema: ${parsed.error.message}`,
            status,
        );
    }
    return parsed.data;
}

export function extractErrorCode(errorData: unknown): string | undefined {
    if (!errorData || typeof errorData !== 'object') {
        return undefined;
    }
    const candidate = errorData as { code?: unknown; error_code?: unknown };
    if (typeof candidate.code === 'string') {
        return candidate.code;
    }
    if (typeof candidate.error_code === 'string') {
        return candidate.error_code;
    }
    return undefined;
}

export function rawErrorMessageFromBody(body: ParsedResponseBody, status: number): string {
    if (body.isJson) {
        return truncateRawMessage(parseErrorMessage(body.json, status));
    }
    if (body.hasBody) {
        return truncateRawMessage(body.text);
    }
    return `Request failed with status ${status}`;
}

export async function parseErrorResponse(response: Response): Promise<ApiClientErrorPayload> {
    const body = await readResponseBody(response);
    const code = body.isJson ? extractErrorCode(body.json) : undefined;
    return {
        status: response.status,
        code,
        messageKey: getErrorMessageKey(code, response.status),
        rawMessage: rawErrorMessageFromBody(body, response.status),
    };
}

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
    Toast,
    ToastAction,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
    type ToastTone,
} from '@/components/ui/toast';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';

/**
 * App-wide transient feedback (audit 2026-09-30 §4.16, D9, FB-01, AX-05).
 *
 * `FeedbackProvider` is mounted once at the app root (`RouteScope` in
 * `App.tsx`) and survives route changes within the signed-in application, so
 * a toast raised just before a navigation (D12 approval-queued) stays
 * visible. It remounts, dropping open toasts, when the principal changes
 * (login, logout) or navigation crosses between public and protected routes.
 * Feature code reaches it through `useFeedback()` (`hooks/useFeedback.ts`).
 */
export type FeedbackTone = ToastTone;

export interface FeedbackAction {
    label: string;
    onClick: () => void;
}

export interface FeedbackOptions {
    /** Translated heading; each tone has a translated default. */
    title?: string;
    description?: string;
    /** Optional follow-up action. A toast with an action never auto-dismisses. */
    action?: FeedbackAction;
    /** Overrides the tone default (5 s; `danger` 8 s). */
    durationMs?: number;
    /** Re-using an id replaces that toast instead of stacking a duplicate. */
    id?: string;
}

export interface FeedbackErrorOptions extends FeedbackOptions {
    /**
     * `errorKeys.*` key (from `apiClient.toUiMessageKey`), namespaced key or text;
     * rendered through `translateUiMessage` as the description when none is given.
     */
    messageKey?: string | null;
}

export interface FeedbackApi {
    success: (options?: FeedbackOptions) => string;
    info: (options?: FeedbackOptions) => string;
    warning: (options?: FeedbackOptions) => string;
    /** Renders tone `danger` and is announced assertively. */
    error: (options?: FeedbackErrorOptions) => string;
    /** Closes one toast, or every open toast when `id` is omitted. */
    dismiss: (id?: string) => void;
}

export const FEEDBACK_DEFAULT_DURATION_MS = 5_000;
export const FEEDBACK_DANGER_DURATION_MS = 8_000;
/** At most this many toasts stay open; a new one closes the oldest. */
export const FEEDBACK_MAX_VISIBLE = 3;
/** Time a closed toast stays mounted so its exit animation can finish. */
const REMOVE_DELAY_MS = 300;

interface FeedbackItem {
    id: string;
    tone: FeedbackTone;
    title: string;
    description?: string;
    action?: FeedbackAction;
    durationMs: number;
    open: boolean;
}

export const FeedbackContext = createContext<FeedbackApi | null>(null);

function resolveDuration(tone: FeedbackTone, options: FeedbackOptions): number {
    if (options.action) return Infinity;
    if (options.durationMs !== undefined) return options.durationMs;
    return tone === 'danger' ? FEEDBACK_DANGER_DURATION_MS : FEEDBACK_DEFAULT_DURATION_MS;
}

/** Keeps the newest open toasts within the visible cap; closed ones are kept until removal. */
function capOpenItems(items: FeedbackItem[]): FeedbackItem[] {
    const openIds = items.filter((item) => item.open).map((item) => item.id);
    const overflow = new Set(openIds.slice(0, Math.max(0, openIds.length - FEEDBACK_MAX_VISIBLE)));
    return overflow.size === 0 ? items : items.map((item) => (overflow.has(item.id) ? { ...item, open: false } : item));
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation(['common', 'errorKeys']);
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const sequence = useRef(0);
    const removalTimers = useRef(new Map<string, number>());

    useEffect(() => {
        const timers = removalTimers.current;
        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
            timers.clear();
        };
    }, []);

    const scheduleRemoval = useCallback((id: string) => {
        if (removalTimers.current.has(id)) return;
        const timer = window.setTimeout(() => {
            removalTimers.current.delete(id);
            setItems((current) => current.filter((item) => item.id !== id || item.open));
        }, REMOVE_DELAY_MS);
        removalTimers.current.set(id, timer);
    }, []);

    const close = useCallback((id?: string) => {
        setItems((current) => current.map((item) => (id === undefined || item.id === id ? { ...item, open: false } : item)));
    }, []);

    // Every closed toast is unmounted after its exit animation.
    useEffect(() => {
        items.filter((item) => !item.open).forEach((item) => scheduleRemoval(item.id));
    }, [items, scheduleRemoval]);

    const show = useCallback((tone: FeedbackTone, options: FeedbackOptions, description?: string) => {
        sequence.current += 1;
        const id = options.id ?? `feedback-${sequence.current}`;
        const pendingRemoval = removalTimers.current.get(id);
        if (pendingRemoval !== undefined) {
            window.clearTimeout(pendingRemoval);
            removalTimers.current.delete(id);
        }
        const item: FeedbackItem = {
            id,
            tone,
            title: options.title ?? t(`common:feedback.default_title.${tone}`),
            description: options.description ?? description,
            action: options.action,
            durationMs: resolveDuration(tone, options),
            open: true,
        };
        setItems((current) => capOpenItems([...current.filter((existing) => existing.id !== id), item]));
        return id;
    }, [t]);

    const api = useMemo<FeedbackApi>(() => ({
        success: (options = {}) => show('success', options),
        info: (options = {}) => show('info', options),
        warning: (options = {}) => show('warning', options),
        error: ({ messageKey, ...options } = {}) => show('danger', options, translateUiMessage(t, messageKey) || undefined),
        dismiss: close,
    }), [close, show, t]);

    return (
        <FeedbackContext.Provider value={api}>
            <ToastProvider label={t('common:feedback.announce_label')} swipeDirection="right">
                {children}
                {items.map((item) => (
                    <Toast
                        key={item.id}
                        tone={item.tone}
                        open={item.open}
                        duration={item.durationMs}
                        onOpenChange={(open) => { if (!open) close(item.id); }}
                    >
                        <ToastTitle>{item.title}</ToastTitle>
                        {item.description ? <ToastDescription>{item.description}</ToastDescription> : null}
                        {item.action ? <ToastAction label={item.action.label} onClick={item.action.onClick} /> : null}
                        <ToastClose label={t('common:feedback.dismiss')} />
                    </Toast>
                ))}
                <ToastViewport label={t('common:feedback.region_label')} />
            </ToastProvider>
        </FeedbackContext.Provider>
    );
}

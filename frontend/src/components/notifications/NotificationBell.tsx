import { useState, useEffect, useId, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification } from '@/types/notification';
import { NOTIFICATIONS_DROPDOWN_LIMIT } from '@/config/constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { buildNotificationPresentation, NotificationPresentationIcon } from './notificationPresentation';
import { logError } from '@/services/logger';
import { useCollectionDataState } from '@/pages/shared/collectionPageState';

interface NotificationBellProps {
    unreadCount?: number;
    onUnreadCountChange?: (count: number) => void;
    /** The Notifications page is open: the bell is its sidebar entry (NAV-02). */
    isCurrentPage?: boolean;
}

export function NotificationBell({ unreadCount = 0, onUnreadCountChange, isCurrentPage = false }: NotificationBellProps) {
    const navigate = useNavigate();
    const { t: tCommon } = useTranslation('common');
    const { t } = useTranslation('notifications');
    const { formatRelativeDate } = useFormattedDate();
    const [isOpen, setIsOpen] = useState(false);
    const collection = useCollectionDataState<Notification>();
    const {
        applyFailure,
        applyPatch,
        applySuccess,
        errorKey,
        items: notifications,
        outcome,
        setIsLoading,
    } = collection;
    const [pendingMutation, setPendingMutation] = useState<number | 'all' | null>(null);
    const [mutationError, setMutationError] = useState<{ target: number | 'all'; message: string } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelId = useId();
    const panelTitleId = useId();
    const pendingMutationRef = useRef<number | 'all' | null>(null);
    const pendingListRetryRef = useRef(false);
    const latestListRequestRef = useRef(0);

    const fetchNotifications = useCallback(async () => {
        const requestId = ++latestListRequestRef.current;
        setIsLoading(true);
        try {
            const response = await notificationsApi.list({ limit: NOTIFICATIONS_DROPDOWN_LIMIT, unread_only: false });
            if (requestId !== latestListRequestRef.current) {
                return;
            }
            setMutationError(null);
            applySuccess({
                items: response.items,
                groups: [],
                capabilities: null,
                total: response.total,
            });
            onUnreadCountChange?.(response.unread_count);
        } catch (error) {
            if (requestId === latestListRequestRef.current) {
                logError('Failed to fetch notifications:', error);
                const failure = applyFailure(error, { fallbackErrorKey: 'errors.load_failed' });
                if (failure.isAccessDenied) {
                    setMutationError(null);
                    onUnreadCountChange?.(0);
                }
            }
        } finally {
            if (requestId === latestListRequestRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applySuccess,
        onUnreadCountChange,
        setIsLoading,
    ]);

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (isOpen) {
            void fetchNotifications();
        }
    }, [fetchNotifications, isOpen]);

    const retryNotifications = useCallback(async () => {
        if (pendingListRetryRef.current) {
            return;
        }
        pendingListRetryRef.current = true;
        try {
            await fetchNotifications();
        } finally {
            pendingListRetryRef.current = false;
        }
    }, [fetchNotifications]);

    // AX-10: Escape closes the popover and returns focus to the bell that opened it.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleReadState = async (notification: Notification) => {
        if (pendingMutationRef.current !== null) {
            return;
        }

        pendingMutationRef.current = notification.id;
        setPendingMutation(notification.id);
        setMutationError(null);
        const mutationListRequestId = latestListRequestRef.current;
        try {
            const { unread_count } = notification.is_read
                ? await notificationsApi.markAsUnread(notification.id)
                : await notificationsApi.markAsRead(notification.id);
            if (mutationListRequestId !== latestListRequestRef.current) {
                return;
            }
            applyPatch({
                items: notifications.map(item =>
                    item.id === notification.id ? { ...item, is_read: !notification.is_read } : item
                ),
                errorKey,
                isAccessDenied: false,
            });
            onUnreadCountChange?.(unread_count);
        } catch (error) {
            logError('Failed to update notification read state:', error);
            if (mutationListRequestId === latestListRequestRef.current) {
                setMutationError({ target: notification.id, message: t('errors.update_read_state') });
            }
        } finally {
            pendingMutationRef.current = null;
            setPendingMutation(null);
        }
    };

    const handleMarkAllAsRead = async () => {
        if (pendingMutationRef.current !== null) {
            return;
        }

        pendingMutationRef.current = 'all';
        setPendingMutation('all');
        setMutationError(null);
        const mutationListRequestId = latestListRequestRef.current;
        try {
            await notificationsApi.markAllAsRead();
            if (mutationListRequestId !== latestListRequestRef.current) {
                return;
            }
            applyPatch({
                items: notifications.map(notification => ({ ...notification, is_read: true })),
                errorKey,
                isAccessDenied: false,
            });
            onUnreadCountChange?.(0);
        } catch (error) {
            logError('Failed to mark all as read:', error);
            if (mutationListRequestId === latestListRequestRef.current) {
                setMutationError({ target: 'all', message: t('errors.mark_all_read') });
            }
        } finally {
            pendingMutationRef.current = null;
            setPendingMutation(null);
        }
    };

    const handleViewAll = () => {
        setIsOpen(false);
        void navigate('/notifications');
    };

    const hasStaleData = outcome.kind === 'stale-with-error';
    let listError: string | null = null;
    let retrying = false;
    if (outcome.kind === 'fatal-error') {
        listError = t(outcome.errorKey);
        retrying = outcome.isRetrying;
    } else if (outcome.kind === 'stale-with-error') {
        listError = t('errors.list_stale');
        retrying = outcome.isRetrying;
    }
    const hasFreshCollection = outcome.kind === 'content' || outcome.kind === 'empty';

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className={cn('relative rounded-full [&_svg]:size-5', isCurrentPage && 'bg-tint/10')}
                aria-label={unreadCount > 0 ? t('aria.bell_unread', { count: unreadCount }) : t('aria.bell')}
                aria-current={isCurrentPage ? 'page' : undefined}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                data-testid="notification-bell-button"
            >
                <Bell aria-hidden="true" className="text-muted-foreground" />
                {unreadCount > 0 && (
                    <span aria-hidden="true" className="notification-count-badge absolute -top-1 -right-1 bg-badge-count text-badge-count-foreground text-2xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </Button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    id={panelId}
                    role="dialog"
                    aria-labelledby={panelTitleId}
                    className="absolute left-0 mt-2 w-80 rounded-xl overflow-hidden shadow-popover z-50 bg-popover text-popover-foreground border border-border"
                    data-testid="notification-dropdown-panel"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <h3 id={panelTitleId} className="text-sm font-semibold text-popover-foreground">{t('title')}</h3>
                        <Button
                            variant="ghost"
                            size="iconCompact"
                            onClick={() => setIsOpen(false)}
                            className="rounded-full"
                            aria-label={tCommon('actions.close')}
                        >
                            <X className="text-muted-foreground" aria-hidden="true" />
                        </Button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[40rem] overflow-y-auto">
                        {outcome.kind === 'initial-loading' && (
                            <LoadingState layout="section" label={tCommon('loading.generic')} className="py-6" />
                        )}
                        {outcome.kind === 'denied' && (
                            <AccessDeniedState
                                layout="section"
                                headingLevel={3}
                                descriptionKey="errors.access_denied"
                                ns="notifications"
                                className="py-6"
                                live
                            />
                        )}
                        {listError && (
                            <>
                                <ErrorState
                                    layout="section"
                                    variant={hasStaleData ? 'banner' : 'block'}
                                    message={listError}
                                    onRetry={() => void retryNotifications()}
                                    isRetrying={retrying}
                                    className={hasStaleData ? 'm-3' : 'py-6'}
                                />
                                {retrying && <span role="status" className="sr-only">{t('status.retrying')}</span>}
                            </>
                        )}
                        {outcome.kind === 'empty' && (
                            <EmptyState
                                layout="section"
                                icon={Bell}
                                title={tCommon('empty.no_notifications')}
                                className="py-6"
                            />
                        )}
                        {(outcome.kind === 'content' || hasStaleData) && notifications.length > 0 && (
                            <div className="divide-y divide-border">
                                {notifications.map(notification => {
                                    const presentation = buildNotificationPresentation(notification);
                                    const content = (
                                        <div className="flex gap-3">
                                            <div className="flex-shrink-0 mt-0.5">
                                                <NotificationPresentationIcon model={presentation} size="sm" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className={`truncate text-sm font-medium ${notification.is_read ? 'text-muted-foreground' : 'text-popover-foreground'}`}>
                                                        {presentation.title}
                                                    </p>
                                                    {!notification.is_read && (
                                                        <span aria-hidden="true" className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                                                    )}
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {presentation.message}
                                                </p>
                                                <p className="mt-1 text-2xs text-muted-foreground">
                                                    {formatRelativeDate(presentation.date)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                    const error = mutationError?.target === notification.id ? mutationError.message : null;
                                    return (
                                        <div
                                            key={notification.id}
                                            className={`px-4 py-3 transition-colors ${!notification.is_read ? 'bg-accent/5' : ''}`}
                                        >
                                            {presentation.path ? (
                                                <Link
                                                    to={presentation.path}
                                                    onClick={() => setIsOpen(false)}
                                                    className="-mx-4 -mt-3 block px-4 pb-2 pt-3 hover:bg-muted"
                                                >
                                                    {content}
                                                </Link>
                                            ) : (
                                                <div className="pb-2">{content}</div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="link"
                                                size="compact"
                                                onClick={() => void toggleReadState(notification)}
                                                aria-busy={pendingMutation === notification.id}
                                                aria-disabled={pendingMutation !== null}
                                                aria-describedby={error ? `notification-${notification.id}-error` : undefined}
                                                className={`px-0 text-accent-text ${pendingMutation !== null ? 'cursor-not-allowed opacity-50' : ''}`}
                                            >
                                                {notification.is_read ? t('actions.mark_unread') : t('actions.mark_read')}
                                            </Button>
                                            {error && (
                                                <p id={`notification-${notification.id}-error`} role="alert" className="mt-1 text-xs text-destructive">
                                                    {error}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                        {hasFreshCollection && unreadCount > 0 && (
                            <div>
                                <Button
                                    type="button"
                                    variant="link"
                                    size="compact"
                                    onClick={() => void handleMarkAllAsRead()}
                                    aria-busy={pendingMutation === 'all'}
                                    aria-disabled={pendingMutation !== null}
                                    aria-describedby={mutationError?.target === 'all' ? 'notification-mark-all-error' : undefined}
                                    className={`px-0 text-accent-text ${pendingMutation !== null ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                    {tCommon('actions.mark_all_read')}
                                </Button>
                                {mutationError?.target === 'all' && (
                                    <p id="notification-mark-all-error" role="alert" className="mt-1 max-w-44 text-xs text-destructive">
                                        {mutationError.message}
                                    </p>
                                )}
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="compact"
                            onClick={handleViewAll}
                            data-testid="notification-view-all-button"
                            className="ml-auto text-muted-foreground"
                        >
                            {tCommon('actions.view_all')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

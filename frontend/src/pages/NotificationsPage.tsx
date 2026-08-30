import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification } from '@/types/notification';
import {
    buildNotificationPresentation,
    NotificationPresentationIcon,
} from '@/components/notifications/notificationPresentation';
import { Button } from '@/components/ui/button';
import { logError } from '@/services/logger';
import { useContentTabs } from '@/hooks/useContentTabs';
import { notificationTabs, useNotificationsPageQuery } from '@/pages/notifications/useNotificationsPageQuery';
import { resolveCollectionOutcome, useCollectionDataState } from '@/pages/shared/collectionPageState';

export function NotificationsPage() {
    const { t } = useTranslation('notifications');
    const { t: tCommon } = useTranslation('common');
    const { formatRelativeDate } = useFormattedDate();
    const { activeTab, isReady, page, setActiveTab, setPage } = useNotificationsPageQuery();
    const collection = useCollectionDataState<Notification>();
    const {
        applyFailure,
        applyPatch,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = collection;
    const [unreadSummary, setUnreadSummary] = useState<{ queryKey: string | null; count: number | null }>({
        queryKey: null,
        count: null,
    });
    const [pendingMutation, setPendingMutation] = useState<number | 'all' | null>(null);
    const [mutationError, setMutationError] = useState<{
        queryKey: string;
        target: number | 'all';
        message: string;
    } | null>(null);
    const pendingMutationRef = useRef<number | 'all' | null>(null);
    const pendingListRetryRef = useRef(false);
    const latestListRequestRef = useRef(0);
    const requestedViewKeyRef = useRef<string | null>(null);
    const currentViewKey = `${activeTab}:${page}`;
    useLayoutEffect(
        () => commitQueryIdentity(currentViewKey),
        [commitQueryIdentity, currentViewKey],
    );
    const queryState = forQuery(currentViewKey);
    const {
        errorKey,
        items: notifications,
        totalCount: total,
    } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const outcome = resolveCollectionOutcome(queryState, isLoading);
    const unreadCount = queryState.isCurrentQuery && unreadSummary.queryKey === currentViewKey
        ? unreadSummary.count
        : null;
    const visibleMutationError = queryState.isCurrentQuery && mutationError?.queryKey === currentViewKey
        ? mutationError
        : null;
    const limit = 20;
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs: notificationTabs,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'notifications',
    });

    const fetchNotifications = useCallback(async () => {
        const requestViewKey = currentViewKey;
        const requestId = ++latestListRequestRef.current;
        setIsLoading(true);
        try {
            const response = await notificationsApi.list({
                skip: page * limit,
                limit,
                unread_only: activeTab === 'unread',
            });
            if (requestId !== latestListRequestRef.current || !isQueryCurrent(requestViewKey)) {
                return;
            }
            const lastPage = Math.max(0, Math.ceil(response.total / limit) - 1);
            if (page > lastPage) {
                setPage(lastPage, true);
                return;
            }
            applySuccess(requestViewKey, {
                items: response.items,
                groups: [],
                capabilities: null,
                total: response.total,
            });
            setUnreadSummary({ queryKey: requestViewKey, count: response.unread_count });
        } catch (error) {
            if (requestId === latestListRequestRef.current && isQueryCurrent(requestViewKey)) {
                logError('Failed to fetch notifications:', error);
                const failure = applyFailure(error, {
                    fallbackErrorKey: 'errors.load_failed',
                });
                if (failure.isAccessDenied) {
                    setUnreadSummary({ queryKey: requestViewKey, count: null });
                    setMutationError(null);
                }
            }
        } finally {
            if (requestId === latestListRequestRef.current && isQueryCurrent(requestViewKey)) {
                setIsLoading(false);
            }
        }
    }, [
        activeTab,
        applyFailure,
        applySuccess,
        currentViewKey,
        isQueryCurrent,
        limit,
        page,
        setPage,
        setIsLoading,
    ]);

    useEffect(() => {
        if (isReady) {
            if (requestedViewKeyRef.current !== currentViewKey) {
                requestedViewKeyRef.current = currentViewKey;
                setMutationError(null);
            }
            beginQuery(currentViewKey);
            void fetchNotifications();
        }

        return () => {
            latestListRequestRef.current += 1;
        };
    }, [beginQuery, currentViewKey, fetchNotifications, isReady]);

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

    const toggleReadState = async (notification: Notification) => {
        if (pendingMutationRef.current !== null) {
            return;
        }

        pendingMutationRef.current = notification.id;
        setPendingMutation(notification.id);
        setMutationError(null);
        const mutationQueryKey = currentViewKey;
        const mutationListRequestId = latestListRequestRef.current;
        try {
            const { unread_count } = notification.is_read
                ? await notificationsApi.markAsUnread(notification.id)
                : await notificationsApi.markAsRead(notification.id);
            if (
                latestListRequestRef.current !== mutationListRequestId
                || !isQueryCurrent(mutationQueryKey)
            ) {
                return;
            }
            setUnreadSummary({ queryKey: mutationQueryKey, count: unread_count });
            if (activeTab === 'unread' && !notification.is_read) {
                const remainingNotifications = notifications.filter(item => item.id !== notification.id);
                applyPatch({
                    items: remainingNotifications,
                    totalCount: Math.max(0, total - 1),
                    errorKey,
                    isAccessDenied: false,
                });
                if (remainingNotifications.length === 0 && page > 0) {
                    setPage(page - 1, true);
                } else {
                    await fetchNotifications();
                }
            } else {
                applyPatch({
                    items: notifications.map(item =>
                        item.id === notification.id ? { ...item, is_read: !notification.is_read } : item
                    ),
                    errorKey,
                    isAccessDenied: false,
                });
            }
        } catch (error) {
            logError('Failed to update notification read state:', error);
            if (
                latestListRequestRef.current === mutationListRequestId
                && isQueryCurrent(mutationQueryKey)
            ) {
                setMutationError({
                    queryKey: mutationQueryKey,
                    target: notification.id,
                    message: t('errors.update_read_state'),
                });
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
        const mutationQueryKey = currentViewKey;
        const mutationListRequestId = latestListRequestRef.current;
        try {
            await notificationsApi.markAllAsRead();
            if (
                latestListRequestRef.current !== mutationListRequestId
                || !isQueryCurrent(mutationQueryKey)
            ) {
                return;
            }
            setUnreadSummary({ queryKey: mutationQueryKey, count: 0 });
            if (activeTab === 'unread') {
                applyPatch({
                    items: [],
                    totalCount: 0,
                    errorKey,
                    isAccessDenied: false,
                });
                setPage(0, true);
            } else {
                applyPatch({
                    items: notifications.map(notification => ({ ...notification, is_read: true })),
                    errorKey,
                    isAccessDenied: false,
                });
            }
        } catch (error) {
            logError('Failed to mark all as read:', error);
            if (
                latestListRequestRef.current === mutationListRequestId
                && isQueryCurrent(mutationQueryKey)
            ) {
                setMutationError({
                    queryKey: mutationQueryKey,
                    target: 'all',
                    message: t('errors.mark_all_read'),
                });
            }
        } finally {
            pendingMutationRef.current = null;
            setPendingMutation(null);
        }
    };

    const totalPages = Math.ceil(total / limit);
    const navigationDisabled = pendingMutation !== null || isLoading;
    const hasFreshSummary = outcome.kind === 'content' || outcome.kind === 'empty';
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
    let subtitle = t('subtitle.unavailable');
    if (hasFreshSummary && unreadCount !== null) {
        subtitle = unreadCount > 0
            ? t('subtitle.unread_count', { count: unreadCount })
            : tCommon('empty.all_caught_up');
    } else if (hasStaleData) {
        subtitle = t('subtitle.stale');
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading">{t('title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {subtitle}
                    </p>
                </div>
                {hasFreshSummary && unreadCount !== null && unreadCount > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleMarkAllAsRead()}
                        aria-disabled={pendingMutation !== null}
                        aria-describedby={visibleMutationError?.target === 'all' ? 'notifications-mark-all-error' : undefined}
                        className="rounded-xl bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
                    >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {tCommon('actions.mark_all_read')}
                    </Button>
                )}
            </div>
            {visibleMutationError?.target === 'all' && (
                <p id="notifications-mark-all-error" role="alert" className="-mt-6 mb-6 text-sm text-destructive text-right">
                    {visibleMutationError.message}
                </p>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6" role="tablist" aria-label={t('title')}>
                <button
                    {...getTabProps('all', 0)}
                    disabled={navigationDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === 'all'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
                        }`}
                >
                    {t('tabs.all')}
                </button>
                <button
                    {...getTabProps('unread', 1)}
                    disabled={navigationDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === 'unread'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
                        }`}
                >
                    {t('tabs.unread')}
                    {unreadCount !== null && unreadCount > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {unreadCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Notification List */}
            {notificationTabs.map((tab) => (
                <div key={tab} className="glass-card overflow-hidden" {...getPanelProps(tab)}>
                {activeTab === tab && (
                    <>
                    {outcome.kind === 'initial-loading' && (
                        <div className="p-8 text-center text-muted-foreground" role="status">
                            {tCommon('loading.generic')}
                        </div>
                    )}
                    {outcome.kind === 'denied' && (
                        <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                            {t('errors.access_denied')}
                        </div>
                    )}
                    {listError && (
                        <div
                            role="alert"
                            className="m-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
                        >
                            <span>{listError}</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="compact"
                                onClick={() => void retryNotifications()}
                                aria-busy={retrying}
                                aria-disabled={retrying}
                                className="ml-auto"
                            >
                                {tCommon('actions.retry')}
                            </Button>
                            {retrying && <span role="status" className="sr-only">{t('status.retrying')}</span>}
                        </div>
                    )}
                    {outcome.kind === 'empty' && (
                        <div className="p-12 text-center text-muted-foreground">
                            <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-medium text-foreground">{tCommon('empty.no_notifications')}</p>
                            <p className="text-sm mt-1">
                                {activeTab === 'unread' ? tCommon('empty.all_caught_up') : tCommon('empty.nothing_to_show')}
                            </p>
                        </div>
                    )}
                    {(outcome.kind === 'content' || hasStaleData) && notifications.length > 0 && (
                        <div className="divide-y divide-white/10">
                        {notifications.map(notification => {
                            const presentation = buildNotificationPresentation(notification);
                            const content = (
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 mt-1">
                                        <NotificationPresentationIcon model={presentation} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className={`text-sm font-semibold ${notification.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                {presentation.title}
                                            </p>
                                            {!notification.is_read && (
                                                <span aria-hidden="true" className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                                            )}
                                            <span className="text-xs text-muted-foreground ml-auto">
                                                {formatRelativeDate(presentation.date)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {presentation.message}
                                        </p>
                                    </div>
                                </div>
                            );
                            const error = visibleMutationError?.target === notification.id
                                ? visibleMutationError.message
                                : null;
                            return (
                                <div
                                    key={notification.id}
                                    className={`px-6 py-4 transition-colors ${!notification.is_read ? 'bg-accent/5' : ''}`}
                                >
                                    {presentation.path ? (
                                        <Link to={presentation.path} className="block -mx-6 -mt-4 px-6 pt-4 pb-3 hover:bg-white/5">
                                            {content}
                                        </Link>
                                    ) : (
                                        <div className="pb-3">{content}</div>
                                    )}
                                    <Button
                                        type="button"
                                        variant="link"
                                        size="compact"
                                        onClick={() => void toggleReadState(notification)}
                                        aria-disabled={pendingMutation !== null}
                                        aria-describedby={error ? `notifications-${notification.id}-error` : undefined}
                                        className="px-0 text-accent-text hover:text-accent-text"
                                    >
                                        {notification.is_read ? t('actions.mark_unread') : t('actions.mark_read')}
                                    </Button>
                                    {error && (
                                        <p id={`notifications-${notification.id}-error`} role="alert" className="mt-1 text-sm text-destructive">
                                            {error}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    )}
                    </>
                )}
                </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                        type="button"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 0 || navigationDisabled}
                        className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-muted-foreground">
                        {t('pagination.page_of', { page: page + 1, total: totalPages })}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                        disabled={page >= totalPages - 1 || navigationDisabled}
                        className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

export default NotificationsPage;

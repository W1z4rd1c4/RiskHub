import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification } from '@/types/notification';
import {
    buildNotificationPresentation,
    NotificationPresentationIcon,
} from '@/components/notifications/notificationPresentation';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/tables/Pagination';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { logError } from '@/services/logger';
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
    const tabsIdPrefix = 'notifications';

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
        <PageContainer size="form">
            <PageHeader
                title={t('title')}
                description={subtitle}
                actions={hasFreshSummary && unreadCount !== null && unreadCount > 0 ? (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleMarkAllAsRead()}
                        aria-disabled={pendingMutation !== null}
                        aria-describedby={visibleMutationError?.target === 'all' ? 'notifications-mark-all-error' : undefined}
                    >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {tCommon('actions.mark_all_read')}
                    </Button>
                ) : undefined}
            />
            {visibleMutationError?.target === 'all' && (
                <InlineMessage id="notifications-mark-all-error" tone="danger">
                    {visibleMutationError.message}
                </InlineMessage>
            )}

            <TabList
                tabs={notificationTabs.map((tab) => ({
                    id: tab,
                    label: tab === 'unread' ? t('tabs.unread') : t('tabs.all'),
                    disabled: navigationDisabled,
                    count: tab === 'unread' && unreadCount !== null && unreadCount > 0 ? unreadCount : undefined,
                }))}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={tabsIdPrefix}
                variant="pill"
                ariaLabel={t('title')}
            />

            {/* Notification List */}
            {notificationTabs.map((tab) => (
                <TabPanel key={tab} tab={tab} activeTab={activeTab} idPrefix={tabsIdPrefix} className="glass-card overflow-hidden">
                {activeTab === tab && (
                    <>
                    {outcome.kind === 'initial-loading' && (
                        <LoadingState layout="section" label={tCommon('loading.generic')} />
                    )}
                    {outcome.kind === 'denied' && (
                        <AccessDeniedState layout="section" descriptionKey="errors.access_denied" ns="notifications" live />
                    )}
                    {listError && (
                        <>
                            <ErrorState
                                layout="section"
                                variant={hasStaleData ? 'banner' : 'block'}
                                message={listError}
                                onRetry={() => void retryNotifications()}
                                isRetrying={retrying}
                                className={hasStaleData ? 'm-4' : undefined}
                            />
                            {retrying && <span role="status" className="sr-only">{t('status.retrying')}</span>}
                        </>
                    )}
                    {outcome.kind === 'empty' && (
                        <EmptyState
                            layout="section"
                            icon={Bell}
                            title={tCommon('empty.no_notifications')}
                            description={activeTab === 'unread' ? tCommon('empty.all_caught_up') : tCommon('empty.nothing_to_show')}
                        />
                    )}
                    {(outcome.kind === 'content' || hasStaleData) && notifications.length > 0 && (
                        <div className="divide-y divide-border">
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
                                        <Link to={presentation.path} className="block -mx-6 -mt-4 px-6 pt-4 pb-3 hover:bg-tint/5">
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
                                        <InlineMessage id={`notifications-${notification.id}-error`} tone="danger" className="mt-2">
                                            {error}
                                        </InlineMessage>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    )}
                    </>
                )}
                </TabPanel>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={page + 1}
                    totalPages={totalPages}
                    totalItems={total}
                    itemsPerPage={limit}
                    isLoading={navigationDisabled}
                    onPageChange={(nextPage) => setPage(Math.min(totalPages - 1, Math.max(0, nextPage - 1)))}
                />
            )}
        </PageContainer>
    );
}

export default NotificationsPage;

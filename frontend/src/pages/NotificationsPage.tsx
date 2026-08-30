import { useState, useEffect, useCallback, useRef } from 'react';
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

export function NotificationsPage() {
    const { t } = useTranslation('notifications');
    const { t: tCommon } = useTranslation('common');
    const { formatRelativeDate } = useFormattedDate();
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [total, setTotal] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [pendingMutation, setPendingMutation] = useState<number | 'all' | null>(null);
    const [mutationError, setMutationError] = useState<{ target: number | 'all'; message: string } | null>(null);
    const pendingMutationRef = useRef<number | 'all' | null>(null);
    const limit = 20;

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const response = await notificationsApi.list({
                skip: page * limit,
                limit,
                unread_only: activeTab === 'unread',
            });
            setNotifications(response.items);
            setTotal(response.total);
            setUnreadCount(response.unread_count);
        } catch (error) {
            logError('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, limit, page]);

    useEffect(() => {
        void fetchNotifications();
    }, [fetchNotifications]);

    const toggleReadState = async (notification: Notification) => {
        if (pendingMutationRef.current !== null) {
            return;
        }

        pendingMutationRef.current = notification.id;
        setPendingMutation(notification.id);
        setMutationError(null);
        try {
            const { unread_count } = notification.is_read
                ? await notificationsApi.markAsUnread(notification.id)
                : await notificationsApi.markAsRead(notification.id);
            setUnreadCount(unread_count);
            if (activeTab === 'unread' && !notification.is_read) {
                const remainingNotifications = notifications.filter(item => item.id !== notification.id);
                setNotifications(remainingNotifications);
                setTotal(currentTotal => Math.max(0, currentTotal - 1));
                if (remainingNotifications.length === 0 && page > 0) {
                    setPage(currentPage => Math.max(0, currentPage - 1));
                } else {
                    await fetchNotifications();
                }
            } else {
                setNotifications(prev =>
                    prev.map(item => item.id === notification.id ? { ...item, is_read: !notification.is_read } : item)
                );
            }
        } catch (error) {
            logError('Failed to update notification read state:', error);
            setMutationError({ target: notification.id, message: t('errors.update_read_state') });
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
        try {
            await notificationsApi.markAllAsRead();
            if (activeTab === 'unread') {
                setNotifications([]);
                setTotal(0);
                setPage(0);
            } else {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            }
            setUnreadCount(0);
        } catch (error) {
            logError('Failed to mark all as read:', error);
            setMutationError({ target: 'all', message: t('errors.mark_all_read') });
        } finally {
            pendingMutationRef.current = null;
            setPendingMutation(null);
        }
    };

    const totalPages = Math.ceil(total / limit);
    const navigationDisabled = pendingMutation !== null;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading">{t('title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {unreadCount > 0 ? t('subtitle.unread_count', { count: unreadCount }) : tCommon('empty.all_caught_up')}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleMarkAllAsRead()}
                        aria-disabled={pendingMutation !== null}
                        aria-describedby={mutationError?.target === 'all' ? 'notifications-mark-all-error' : undefined}
                        className="rounded-xl bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
                    >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {tCommon('actions.mark_all_read')}
                    </Button>
                )}
            </div>
            {mutationError?.target === 'all' && (
                <p id="notifications-mark-all-error" role="alert" className="-mt-6 mb-6 text-sm text-destructive text-right">
                    {mutationError.message}
                </p>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    type="button"
                    onClick={() => { setActiveTab('all'); setPage(0); }}
                    disabled={navigationDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === 'all'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
                        }`}
                >
                    {t('tabs.all')}
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveTab('unread'); setPage(0); }}
                    disabled={navigationDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === 'unread'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
                        }`}
                >
                    {t('tabs.unread')}
                    {unreadCount > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {unreadCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Notification List */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">{tCommon('loading.generic')}</div>
                ) : notifications.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium text-foreground">{tCommon('empty.no_notifications')}</p>
                        <p className="text-sm mt-1">
                            {activeTab === 'unread' ? tCommon('empty.all_caught_up') : tCommon('empty.nothing_to_show')}
                        </p>
                    </div>
                ) : (
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
                            const error = mutationError?.target === notification.id ? mutationError.message : null;
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
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
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
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
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

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, AlertCircle, Clock, AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification, NotificationType } from '@/types/notification';

/**
 * Get icon for notification type.
 */
function getNotificationIcon(type: NotificationType, size: 'sm' | 'md' = 'md') {
    const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    switch (type) {
        case 'approval_pending':
            return <Clock className={`${sizeClass} text-amber-400`} />;
        case 'approval_resolved':
            return <CheckCircle className={`${sizeClass} text-emerald-400`} />;
        case 'kri_due_soon':
        case 'kri_due_tomorrow':
            return <Clock className={`${sizeClass} text-amber-400`} />;
        case 'kri_overdue':
            return <AlertCircle className={`${sizeClass} text-rose-400`} />;
        case 'kri_near_breach':
            return <AlertTriangle className={`${sizeClass} text-orange-400`} />;
        case 'kri_breach_detected':
            return <AlertCircle className={`${sizeClass} text-rose-500`} />;
        default:
            return <Bell className={`${sizeClass} text-slate-400`} />;
    }
}

/**
 * Get navigation path for notification resource.
 */
function getResourcePath(resourceType?: string, resourceId?: number): string | null {
    if (!resourceType || !resourceId) return null;

    switch (resourceType) {
        case 'risk':
            return `/risks/${resourceId}`;
        case 'control':
            return `/controls/${resourceId}`;
        case 'kri':
            return `/kris/${resourceId}`;
        case 'approval':
            return '/approvals';
        default:
            return null;
    }
}

export function NotificationsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('notifications');
    const { t: tCommon } = useTranslation('common');
    const { formatRelativeDate } = useFormattedDate();
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [total, setTotal] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
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
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, limit, page]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleNotificationClick = async (notification: Notification) => {
        // Mark as read
        if (!notification.is_read) {
            try {
                const { unread_count } = await notificationsApi.markAsRead(notification.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
                );
                setUnreadCount(unread_count);  // Server-authoritative count
            } catch (error) {
                console.error('Failed to mark as read:', error);
            }
        }

        // Navigate to resource
        const path = getResourcePath(notification.resource_type, notification.resource_id);
        if (path) {
            navigate(path);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationsApi.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white font-heading">{t('title')}</h1>
                    <p className="text-slate-400 mt-1">
                        {unreadCount > 0 ? t('subtitle.unread_count', { count: unreadCount }) : tCommon('empty.all_caught_up')}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllAsRead}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
                    >
                        <Check className="h-4 w-4" />
                        {tCommon('actions.mark_all_read')}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => { setActiveTab('all'); setPage(0); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all'
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                >
                    {t('tabs.all')}
                </button>
                <button
                    onClick={() => { setActiveTab('unread'); setPage(0); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'unread'
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
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
                    <div className="p-8 text-center text-slate-400">{tCommon('loading.generic')}</div>
                ) : notifications.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium text-white">{tCommon('empty.no_notifications')}</p>
                        <p className="text-sm mt-1">
                            {activeTab === 'unread' ? tCommon('empty.all_caught_up') : tCommon('empty.nothing_to_show')}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {notifications.map(notification => (
                            <button
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`w-full text-left px-6 py-4 hover:bg-white/5 transition-colors ${!notification.is_read ? 'bg-accent/5' : ''
                                    }`}
                            >
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 mt-1">
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className={`text-sm font-semibold ${notification.is_read ? 'text-slate-300' : 'text-white'
                                                }`}>
                                                {notification.title}
                                            </p>
                                            {!notification.is_read && (
                                                <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                                            )}
                                            <span className="text-xs text-slate-500 ml-auto">
                                                {formatRelativeDate(notification.created_at)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400">
                                            {notification.message}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-slate-400">
                        {t('pagination.page_of', { page: page + 1, total: totalPages })}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

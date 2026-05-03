import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification } from '@/types/notification';
import { NOTIFICATIONS_DROPDOWN_LIMIT } from '@/config/constants';
import { buildNotificationPresentation, NotificationPresentationIcon } from './notificationPresentation';
import { logError } from '@/services/logger';

interface NotificationBellProps {
    unreadCount?: number;
    onUnreadCountChange?: (count: number) => void;
}

export function NotificationBell({ unreadCount = 0, onUnreadCountChange }: NotificationBellProps) {
    const navigate = useNavigate();
    const { t: tCommon } = useTranslation('common');
    const { t } = useTranslation('notifications');
    const { formatRelativeDate } = useFormattedDate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (isOpen) {
            const fetchNotifications = async () => {
                setLoading(true);
                try {
                    const response = await notificationsApi.list({ limit: NOTIFICATIONS_DROPDOWN_LIMIT, unread_only: false });
                    setNotifications(response.items);
                    onUnreadCountChange?.(response.unread_count);
                } catch (error) {
                    logError('Failed to fetch notifications:', error);
                } finally {
                    setLoading(false);
                }
            };
            void fetchNotifications();
        }
    }, [isOpen, onUnreadCountChange]);

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

    // Mark notification as read (shared by click and hover)
    const markAsRead = async (notification: Notification) => {
        if (!notification.is_read) {
            try {
                const { unread_count } = await notificationsApi.markAsRead(notification.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
                );
                onUnreadCountChange?.(unread_count);
            } catch (error) {
                logError('Failed to mark as read:', error);
            }
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        // Mark as read on click
        await markAsRead(notification);

        // Navigate to resource
        const path = buildNotificationPresentation(notification).path;
        if (path) {
            void navigate(path);
        }
        setIsOpen(false);
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationsApi.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            onUnreadCountChange?.(0);
        } catch (error) {
            logError('Failed to mark all as read:', error);
        }
    };

    const handleViewAll = () => {
        setIsOpen(false);
        void navigate('/notifications');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label={t('aria.bell')}
                data-testid="notification-bell-button"
            >
                <Bell className="h-5 w-5 text-slate-400 hover:text-white transition-colors" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    className="absolute left-0 mt-2 w-80 rounded-xl overflow-hidden shadow-2xl z-50 bg-popover text-popover-foreground border border-border"
                    data-testid="notification-dropdown-panel"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded-full hover:bg-white/10"
                            aria-label={tCommon('actions.close')}
                        >
                            <X className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[40rem] overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center text-slate-400">{tCommon('loading.generic')}</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>{tCommon('empty.no_notifications')}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {notifications.map(notification => {
                                    const presentation = buildNotificationPresentation(notification);
                                    return (
                                    <button
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        onMouseEnter={() => markAsRead(notification)}
                                        className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${!notification.is_read ? 'bg-accent/5' : ''
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="flex-shrink-0 mt-0.5">
                                                <NotificationPresentationIcon model={presentation} size="sm" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className={`text-sm font-medium truncate ${notification.is_read ? 'text-slate-300' : 'text-white'
                                                        }`}>
                                                        {presentation.title}
                                                    </p>
                                                    {!notification.is_read && (
                                                        <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                                    {presentation.message}
                                                </p>
                                                <p className="text-[10px] text-slate-500 mt-1">
                                                    {formatRelativeDate(presentation.date)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="text-xs text-accent hover:text-accent/80 font-medium"
                            >
                                {tCommon('actions.mark_all_read')}
                            </button>
                        )}
                        <button
                            onClick={handleViewAll}
                            data-testid="notification-view-all-button"
                            className="text-xs text-slate-400 hover:text-white font-medium ml-auto"
                        >
                            {tCommon('actions.view_all')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

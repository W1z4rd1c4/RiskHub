import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification } from '@/types/notification';
import { NOTIFICATIONS_DROPDOWN_LIMIT } from '@/config/constants';
import { Button } from '@/components/ui/button';
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
    const [pendingMutation, setPendingMutation] = useState<number | 'all' | null>(null);
    const [mutationError, setMutationError] = useState<{ target: number | 'all'; message: string } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const pendingMutationRef = useRef<number | 'all' | null>(null);

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
            setNotifications(prev =>
                prev.map(item => item.id === notification.id ? { ...item, is_read: !notification.is_read } : item)
            );
            onUnreadCountChange?.(unread_count);
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
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            onUnreadCountChange?.(0);
        } catch (error) {
            logError('Failed to mark all as read:', error);
            setMutationError({ target: 'all', message: t('errors.mark_all_read') });
        } finally {
            pendingMutationRef.current = null;
            setPendingMutation(null);
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
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label={t('aria.bell')}
                data-testid="notification-bell-button"
            >
                <Bell className="h-5 w-5 text-slate-400 hover:text-white transition-colors" />
                {unreadCount > 0 && (
                    <span className="notification-count-badge absolute -top-1 -right-1 bg-rose-700 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
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
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <h3 className="text-sm font-semibold text-popover-foreground">{t('title')}</h3>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="rounded-full p-1 hover:bg-muted"
                            aria-label={tCommon('actions.close')}
                        >
                            <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[40rem] overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center text-muted-foreground">{tCommon('loading.generic')}</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>{tCommon('empty.no_notifications')}</p>
                            </div>
                        ) : (
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
                                                <p className="mt-1 text-[10px] text-muted-foreground">
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
                                                className={`px-0 text-accent-text hover:text-accent-text ${pendingMutation !== null ? 'cursor-not-allowed opacity-50' : ''}`}
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
                        {unreadCount > 0 && (
                            <div>
                                <Button
                                    type="button"
                                    variant="link"
                                    size="compact"
                                    onClick={() => void handleMarkAllAsRead()}
                                    aria-busy={pendingMutation === 'all'}
                                    aria-disabled={pendingMutation !== null}
                                    aria-describedby={mutationError?.target === 'all' ? 'notification-mark-all-error' : undefined}
                                    className={`px-0 text-accent-text hover:text-accent-text ${pendingMutation !== null ? 'cursor-not-allowed opacity-50' : ''}`}
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
                        <button
                            type="button"
                            onClick={handleViewAll}
                            data-testid="notification-view-all-button"
                            className="ml-auto text-xs font-medium text-muted-foreground hover:text-popover-foreground"
                        >
                            {tCommon('actions.view_all')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, AlertCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { useFormattedDate, useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { Notification, NotificationType } from '@/types/notification';
import { NOTIFICATIONS_DROPDOWN_LIMIT } from '@/config/constants';

/**
 * Get icon for notification type.
 */
function getNotificationIcon(type: NotificationType) {
    switch (type) {
        case 'approval_pending':
            return <Clock className="h-4 w-4 text-amber-400" />;
        case 'approval_resolved':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'approval_cancelled':
            return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        case 'kri_due_soon':
        case 'kri_due_tomorrow':
            return <Clock className="h-4 w-4 text-amber-400" />;
        case 'kri_overdue':
            return <AlertCircle className="h-4 w-4 text-rose-400" />;
        case 'kri_near_breach':
            return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        case 'kri_breach_detected':
            return <AlertCircle className="h-4 w-4 text-rose-500" />;
        case 'questionnaire_sent':
        case 'questionnaire_due_soon':
            return <Clock className="h-4 w-4 text-amber-400" />;
        case 'questionnaire_overdue':
            return <AlertCircle className="h-4 w-4 text-rose-400" />;
        case 'questionnaire_submitted':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'questionnaire_clarification_requested':
            return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        case 'vendor_assessment_submitted':
        case 'vendor_assessment_decided':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'vendor_assessment_committee_recommended':
            return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        case 'vendor_reassessment_due_soon':
        case 'vendor_sla_due_soon':
        case 'vendor_sla_due_tomorrow':
            return <Clock className="h-4 w-4 text-amber-400" />;
        case 'vendor_reassessment_overdue':
        case 'vendor_sla_overdue':
            return <AlertCircle className="h-4 w-4 text-rose-400" />;
        case 'vendor_sla_near_breach':
            return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        case 'vendor_sla_breach_detected':
            return <AlertCircle className="h-4 w-4 text-rose-500" />;
        default:
            return <Bell className="h-4 w-4 text-slate-400" />;
    }
}

/**
 * Get navigation path for notification resource.
 */
function vendorTabForNotification(type: NotificationType): string | null {
    if (type === 'vendor_reassessment_due_soon' || type === 'vendor_reassessment_overdue') return 'schedule';
    if (
        type === 'vendor_sla_due_soon' ||
        type === 'vendor_sla_due_tomorrow' ||
        type === 'vendor_sla_overdue' ||
        type === 'vendor_sla_near_breach' ||
        type === 'vendor_sla_breach_detected'
    ) {
        return 'sla';
    }
    if (
        type === 'vendor_assessment_submitted' ||
        type === 'vendor_assessment_committee_recommended' ||
        type === 'vendor_assessment_decided'
    ) {
        return 'assessments';
    }
    return null;
}

function getResourcePath(notification: Notification): string | null {
    const resourceType = notification.resource_type;
    const resourceId = notification.resource_id;
    if (!resourceType || !resourceId) return null;

    switch (resourceType) {
        case 'risk':
            return `/risks/${resourceId}`;
        case 'control':
            return `/controls/${resourceId}`;
        case 'kri':
            return `/kris/${resourceId}`;
        case 'vendor':
            return `/vendors/${resourceId}${vendorTabForNotification(notification.type) ? `?tab=${vendorTabForNotification(notification.type)}` : ''}`;
        case 'approval':
            return '/approvals';
        default:
            return null;
    }
}

interface NotificationBellProps {
    initialUnreadCount?: number;
}

export function NotificationBell({ initialUnreadCount = 0 }: NotificationBellProps) {
    const navigate = useNavigate();
    const { t: tCommon } = useTranslation('common');
    const { t } = useTranslation('notifications');
    const { formatRelativeDate } = useFormattedDate();
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setUnreadCount(initialUnreadCount);
    }, [initialUnreadCount]);

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (isOpen) {
            const fetchNotifications = async () => {
                setLoading(true);
                try {
                    const response = await notificationsApi.list({ limit: NOTIFICATIONS_DROPDOWN_LIMIT, unread_only: false });
                    setNotifications(response.items);
                    setUnreadCount(response.unread_count);
                } catch (error) {
                    console.error('Failed to fetch notifications:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchNotifications();
        }
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

    // Mark notification as read (shared by click and hover)
    const markAsRead = async (notification: Notification) => {
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
    };

    const handleNotificationClick = async (notification: Notification) => {
        // Mark as read on click
        await markAsRead(notification);

        // Navigate to resource
        const path = getResourcePath(notification);
        if (path) {
            navigate(path);
        }
        setIsOpen(false);
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

    const handleViewAll = () => {
        setIsOpen(false);
        navigate('/notifications');
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
                        >
                            <X className="h-4 w-4 text-slate-400" />
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
                                {notifications.map(notification => (
                                    <button
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        onMouseEnter={() => markAsRead(notification)}
                                        className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${!notification.is_read ? 'bg-accent/5' : ''
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="flex-shrink-0 mt-0.5">
                                                {getNotificationIcon(notification.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className={`text-sm font-medium truncate ${notification.is_read ? 'text-slate-300' : 'text-white'
                                                        }`}>
                                                        {notification.title}
                                                    </p>
                                                    {!notification.is_read && (
                                                        <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                                    {notification.message}
                                                </p>
                                                <p className="text-[10px] text-slate-500 mt-1">
                                                    {formatRelativeDate(notification.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
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

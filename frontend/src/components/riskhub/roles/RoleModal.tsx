import type { FormEvent } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    getPermissionLabel,
    getPermissionResourceLabel,
} from '@/components/access/permissionPresentation';
import type { PermissionRead, RoleHubCreate, RoleHubRead, RoleHubUpdate } from '@/services/riskHubApi';

import {
    groupPermissionsByResource,
    normalizeRoleIdentifier,
    selectedPermissionIdsForRole,
} from './rolePermissions';

interface RoleModalProps {
    allPermissions: PermissionRead[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: RoleHubCreate | RoleHubUpdate) => Promise<void>;
    permissionsLoading: boolean;
    role?: RoleHubRead | null;
}

export function RoleModal({
    allPermissions,
    isOpen,
    onClose,
    onSave,
    permissionsLoading,
    role,
}: RoleModalProps) {
    const { t } = useTranslation(['admin', 'common', 'settings']);
    const titleId = useId();
    const [description, setDescription] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
    const permissionsByResource = useMemo(
        () => groupPermissionsByResource(allPermissions),
        [allPermissions],
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setName(role?.name ?? '');
        setDisplayName(role?.display_name ?? '');
        setDescription(role?.description ?? '');
        setErrorKey(null);
        setSelectedPermissionIds(selectedPermissionIdsForRole(role, allPermissions));
    }, [allPermissions, isOpen, role]);

    function togglePermission(id: number) {
        setSelectedPermissionIds((current) => (
            current.includes(id)
                ? current.filter((permissionId) => permissionId !== id)
                : [...current, id]
        ));
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setErrorKey(null);
        setSaving(true);
        try {
            if (role) {
                await onSave({
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds,
                });
            } else {
                await onSave({
                    name,
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds,
                });
            }
            onClose();
        } catch (error: unknown) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <DialogShell isOpen={isOpen} onClose={onClose} titleId={titleId} size="lg" isBusy={saving}>
            <DialogHeader title={role ? t('admin:roles_panel.modal.edit_title') : t('admin:roles_panel.modal.new_title')} />
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <DialogBody className="custom-scrollbar space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {!role && (
                            <Field
                                id="role-name"
                                label={t('admin:roles_panel.modal.fields.role_identifier')}
                                help={t('admin:roles_panel.modal.hints.role_identifier')}
                                required
                            >
                                {(field) => (
                                    <Input
                                        {...field}
                                        type="text"
                                        value={name}
                                        onChange={(event) => setName(normalizeRoleIdentifier(event.target.value))}
                                        className="font-mono"
                                        placeholder={t('admin:roles_panel.modal.placeholders.role_identifier')}
                                        required
                                    />
                                )}
                            </Field>
                        )}

                        <Field
                            id="role-display-name"
                            label={t('admin:roles_panel.modal.fields.display_name')}
                            required
                            className={cn(!role ? '' : 'md:col-span-2')}
                        >
                            {(field) => (
                                <Input
                                    {...field}
                                    type="text"
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder={t('admin:roles_panel.modal.placeholders.display_name')}
                                    required
                                />
                            )}
                        </Field>
                    </div>

                    <Field id="role-description" label={t('common:labels.description')}>
                        {(field) => (
                            <Textarea
                                {...field}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder={t('admin:roles_panel.modal.placeholders.description')}
                                rows={2}
                            />
                        )}
                    </Field>

                    <div>
                        <span className="block text-sm font-medium text-foreground mb-3">
                            {t('admin:roles_panel.modal.fields.permissions')}
                        </span>
                        {permissionsLoading ? (
                            <div className="text-muted-foreground text-sm py-4 text-center">
                                {t('admin:roles_panel.modal.loading_permissions')}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                {Object.entries(permissionsByResource).map(([resource, permissions]) => (
                                    <div key={resource} className="bg-tint/5 rounded-lg p-3 border border-border">
                                        <h4 className="text-xs font-bold text-accent-text uppercase mb-2 tracking-wider">
                                            {getPermissionResourceLabel(resource, t)}
                                        </h4>
                                        <div className="space-y-2">
                                            {permissions.map((permission) => {
                                                const permissionToken = `${permission.resource}:${permission.action}`;
                                                const permissionLabel = getPermissionLabel(permissionToken, t);
                                                return (
                                                    <label key={permission.id} htmlFor={`role-perm-${permission.id}`} className="flex items-start gap-2 cursor-pointer group">
                                                        <input
                                                            id={`role-perm-${permission.id}`}
                                                            type="checkbox"
                                                            aria-label={permissionLabel}
                                                            checked={selectedPermissionIds.includes(permission.id)}
                                                            onChange={() => togglePermission(permission.id)}
                                                            className="mt-0.5 rounded border-tint/20 bg-tint/5 text-accent focus:ring-accent"
                                                        />
                                                        <div>
                                                            <span className="block text-sm text-foreground">
                                                                {permissionLabel}
                                                            </span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!permissionsLoading && allPermissions.length > 0 && (
                            <details className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                                <summary className="cursor-pointer font-medium text-foreground">
                                    {t('permissions.technical_details', { ns: 'settings' })}
                                </summary>
                                <ul className="mt-2 space-y-1">
                                    {allPermissions.map((permission) => {
                                        const permissionToken = `${permission.resource}:${permission.action}`;
                                        return <li key={permission.id}><code>{permissionToken}</code></li>;
                                    })}
                                </ul>
                            </details>
                        )}
                    </div>

                    {errorKey && (
                        <div className="flex items-center gap-2 text-destructive text-sm">
                            <AlertCircle className="h-4 w-4" aria-hidden="true" />
                            {t(errorKey, { ns: 'errorKeys' })}
                        </div>
                    )}
                </DialogBody>
                <DialogFooter
                    onCancel={onClose}
                    cancelLabel={t('common:actions.cancel')}
                    submitType="submit"
                    submitDisabled={permissionsLoading}
                    isSubmitting={saving}
                    submitLabel={saving ? t('admin:roles_panel.modal.saving') : t('admin:roles_panel.modal.save_role')}
                />
            </form>
        </DialogShell>
    );
}

import type { FormEvent } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { labelTextClassName } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/ui/state';
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
import { RiskHubFieldError } from '../panelPrimitives';

interface RoleModalProps {
    allPermissions: PermissionRead[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: RoleHubCreate | RoleHubUpdate) => Promise<void>;
    permissionsLoading: boolean;
    /** The permission catalogue failed to load (no cached data). */
    permissionsLoadFailed?: boolean;
    permissionsRefetching?: boolean;
    onRetryPermissions?: () => void;
    role?: RoleHubRead | null;
}

export function RoleModal({
    allPermissions,
    isOpen,
    onClose,
    onSave,
    permissionsLoading,
    permissionsLoadFailed = false,
    permissionsRefetching = false,
    onRetryPermissions,
    role,
}: RoleModalProps) {
    const { t } = useTranslation(['admin', 'common', 'settings']);
    const titleId = useId();
    const permissionsLabelId = useId();
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

                    <div role="group" aria-labelledby={permissionsLabelId}>
                        <span id={permissionsLabelId} className={cn('mb-3 block', labelTextClassName)}>
                            {t('admin:roles_panel.modal.fields.permissions')}
                        </span>
                        {permissionsLoading ? (
                            <LoadingState
                                layout="inline"
                                className="justify-center py-4"
                                label={t('admin:roles_panel.modal.loading_permissions')}
                            />
                        ) : permissionsLoadFailed ? (
                            <ErrorState
                                layout="inline"
                                onRetry={onRetryPermissions}
                                isRetrying={permissionsRefetching}
                                testId="role-modal-permissions-error"
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                {Object.entries(permissionsByResource).map(([resource, permissions]) => (
                                    <Card key={resource} as="div" tone="nested" padding="compact">
                                        <fieldset className="space-y-2">
                                            <legend className="text-eyebrow mb-2">
                                                {getPermissionResourceLabel(resource, t)}
                                            </legend>
                                            {permissions.map((permission) => {
                                                const permissionToken = `${permission.resource}:${permission.action}`;
                                                return (
                                                    <Field
                                                        key={permission.id}
                                                        id={`role-perm-${permission.id}`}
                                                        layout="inline"
                                                        label={getPermissionLabel(permissionToken, t)}
                                                        labelClassName="font-normal leading-snug"
                                                    >
                                                        {(field) => (
                                                            <Checkbox
                                                                {...field}
                                                                checked={selectedPermissionIds.includes(permission.id)}
                                                                onCheckedChange={() => togglePermission(permission.id)}
                                                            />
                                                        )}
                                                    </Field>
                                                );
                                            })}
                                        </fieldset>
                                    </Card>
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

                    <RiskHubFieldError errorKey={errorKey} />
                </DialogBody>
                <DialogFooter
                    onCancel={onClose}
                    cancelLabel={t('common:actions.cancel')}
                    submitType="submit"
                    submitDisabled={permissionsLoading || permissionsLoadFailed}
                    isSubmitting={saving}
                    submitLabel={saving ? t('admin:roles_panel.modal.saving') : t('admin:roles_panel.modal.save_role')}
                />
            </form>
        </DialogShell>
    );
}

import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { Lock, Mail, Save, Shield, User as UserIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { RoleWithPermissions } from '@/types/access';
import type { UserCreate } from '@/types/user';

interface UserNewLocalFormProps {
    departments: DepartmentSummary[];
    formData: UserCreate;
    isLoading: boolean;
    onCancel: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    roles: RoleWithPermissions[];
    setFormData: Dispatch<SetStateAction<UserCreate>>;
}

export function UserNewLocalForm({
    departments,
    formData,
    isLoading,
    onCancel,
    onSubmit,
    roles,
    setFormData,
}: UserNewLocalFormProps) {
    const { t } = useTranslation(['admin', 'common']);

    return (
        <form onSubmit={onSubmit} className="space-y-6" aria-busy={isLoading}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <UserIcon aria-hidden="true" className="h-5 w-5 text-accent-text" />
                        {t('user_new.personal_information', { ns: 'admin' })}
                    </h2>

                    <Field label={t('user_new.full_name', { ns: 'admin' })} required>
                        {(field) => (
                            <Input
                                {...field}
                                required
                                type="text"
                                leadingIcon={UserIcon}
                                placeholder={t('form.placeholders.name')}
                                value={formData.name}
                                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label={t('user_new.email_address', { ns: 'admin' })} required>
                        {(field) => (
                            <Input
                                {...field}
                                required
                                type="email"
                                leadingIcon={Mail}
                                placeholder={t('form.placeholders.email')}
                                value={formData.email}
                                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label={t('user_new.password', { ns: 'admin' })} required>
                        {(field) => (
                            <Input
                                {...field}
                                required
                                type="password"
                                autoComplete="new-password"
                                leadingIcon={Lock}
                                placeholder={t('form.placeholders.password')}
                                value={formData.password}
                                onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                            />
                        )}
                    </Field>
                </div>

                <div className="glass-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Shield aria-hidden="true" className="h-5 w-5 text-accent-text" />
                        {t('user_new.role_access', { ns: 'admin' })}
                    </h2>

                    <Field label={t('user_new.platform_role', { ns: 'admin' })} required>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={formData.role_id.toString()}
                                onValueChange={(value) => setFormData({ ...formData, role_id: Number(value) })}
                                className="w-full"
                                options={roles.map((role) => ({ value: role.id.toString(), label: role.display_name }))}
                            />
                        )}
                    </Field>

                    <Field label={t('common:labels.department')} optional>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={formData.department_id?.toString() ?? ''}
                                onValueChange={(value) => setFormData({ ...formData, department_id: value ? Number(value) : null })}
                                placeholder={t('form.placeholders.no_department_scoping')}
                                allowEmpty
                                emptyLabel={t('form.placeholders.no_department_scoping')}
                                className="w-full"
                                options={departments.map((department) => ({ value: department.id.toString(), label: department.name }))}
                            />
                        )}
                    </Field>

                    <Field layout="inline" label={t('user_new.active_immediately', { ns: 'admin' })} className="pt-4">
                        {(field) => (
                            <Checkbox
                                {...field}
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                        )}
                    </Field>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {t('actions.cancel', { ns: 'common' })}
                </Button>
                <Button type="submit" variant="accent" isLoading={isLoading}>
                    {!isLoading ? <Save aria-hidden="true" /> : null}
                    {t('users.create_user', { ns: 'admin' })}
                </Button>
            </div>
        </form>
    );
}

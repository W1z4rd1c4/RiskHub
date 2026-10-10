import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Check, X } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys } from '@/lib/queryKeys';
import { getRoleLabel } from '@/lib/roleLabels';
import {
    APPROVAL_SCENARIO_APPROVER_ROLES,
    type ApprovalScenario,
    type ApprovalScenarioApproverRole,
    type ApprovalScenarioFixedPolicyDefinition,
    type ApprovalScenarioUpdate,
} from '@/services/riskHubApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DialogBody } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/multi-select';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { RiskHubFieldError, RiskHubModalActions, RiskHubModalFrame } from './panelPrimitives';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { useRiskHubConfigResource } from './useRiskHubConfigResource';

// Special dynamic role entry for risk owner (not a system role in roles table)
const SPECIAL_ROLE_VALUES = ['risk_owner'] as const;
const APPROVER_ROLE_CODES = new Set<string>(APPROVAL_SCENARIO_APPROVER_ROLES);
const FIXED_PROTECTED_SCENARIO_KEYS = new Set([
    'protected_process_edit',
    'protected_asset_edit',
    'protected_vendor_edit',
    'accountability_reassignment',
]);
const FIXED_PROTECTED_APPROVER_ROLES = new Set<string>(['risk_manager', 'cro']);
const LEGACY_PROTECTED_PROCESS_FIXED_POLICY: ApprovalScenarioFixedPolicyDefinition = {
    threshold: 'current_or_proposed_cif_yes',
    covered_actions: ['edit'],
    allow_self_approval: false,
};

function isApprovalScenarioApproverRole(role: string): role is ApprovalScenarioApproverRole {
    return APPROVER_ROLE_CODES.has(role);
}

interface RoleOption {
    value: string;
    label: string;
}

interface EditScenarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenario: ApprovalScenario | null;
    availableRoles: RoleOption[];
    rolesLoading: boolean;
    onSave: (data: ApprovalScenarioUpdate) => Promise<void>;
}

function EditScenarioModal({ isOpen, onClose, scenario, availableRoles, rolesLoading, onSave }: EditScenarioModalProps) {
    const { t } = useTranslation(['admin', 'common']);
    const [requiresApproval, setRequiresApproval] = useState(true);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const isFixedProtectedScenario = scenario != null && FIXED_PROTECTED_SCENARIO_KEYS.has(scenario.key);
    const fixedPolicyDefinition = isFixedProtectedScenario && scenario?.fixed_policy
        ? scenario.fixed_policy_definition ?? LEGACY_PROTECTED_PROCESS_FIXED_POLICY
        : null;
    const selectableRoles = isFixedProtectedScenario
        ? availableRoles.filter((role) => FIXED_PROTECTED_APPROVER_ROLES.has(role.value))
        : availableRoles;

    useEffect(() => {
        if (isOpen && scenario) {
            setRequiresApproval(scenario.requires_approval);
            setSelectedRoles(
                FIXED_PROTECTED_SCENARIO_KEYS.has(scenario.key)
                    ? scenario.approver_roles.filter((role) => FIXED_PROTECTED_APPROVER_ROLES.has(role))
                    : scenario.approver_roles,
            );
            setErrorKey(null);
        }
    }, [isOpen, scenario]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorKey(null);
        setSaving(true);
        try {
            await onSave({
                requires_approval: requiresApproval,
                approver_roles: selectedRoles
                    .filter(isApprovalScenarioApproverRole)
                    .filter((role) => !isFixedProtectedScenario || FIXED_PROTECTED_APPROVER_ROLES.has(role)),
            });
            onClose();
        } catch (error: unknown) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !scenario) return null;

    return (
        <RiskHubModalFrame onClose={onClose} isBusy={saving} title={t('admin:approval_scenarios.modal.configure', { name: scenario.display_name })}>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <DialogBody className="space-y-6">
                    <Field layout="inline" label={t('admin:approval_scenarios.requires_approval')}>
                        {(field) => (
                            <Switch
                                {...field}
                                checked={requiresApproval}
                                onCheckedChange={setRequiresApproval}
                            />
                        )}
                    </Field>

                    {fixedPolicyDefinition ? (
                        <Card
                            tone="nested"
                            padding="compact"
                            data-testid={
                                scenario.key === 'accountability_reassignment'
                                    ? 'accountability-reassignment-fixed-policy'
                                    : scenario.key === 'protected_vendor_edit'
                                        ? 'protected-vendor-fixed-policy'
                                        : 'protected-process-fixed-policy'
                            }
                        >
                            <h3 className="text-sm font-bold text-foreground">
                                {t('admin:approval_scenarios.fixed_policy.title')}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('admin:approval_scenarios.fixed_policy.immutable_help')}
                            </p>
                            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                                <div>
                                    <dt className="text-eyebrow">
                                        {t('admin:approval_scenarios.fixed_policy.threshold')}
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {t(`admin:approval_scenarios.fixed_policy.triggers.${fixedPolicyDefinition.threshold}`)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-eyebrow">
                                        {t('admin:approval_scenarios.fixed_policy.actions')}
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {fixedPolicyDefinition.covered_actions
                                            .map((action) => t(`admin:approval_scenarios.fixed_policy.covered_action_values.${action}`))
                                            .join(', ')}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-eyebrow">
                                        {t('admin:approval_scenarios.fixed_policy.separation')}
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {t(`admin:approval_scenarios.fixed_policy.self_approval.${String(fixedPolicyDefinition.allow_self_approval)}`)}
                                    </dd>
                                </div>
                            </dl>
                        </Card>
                    ) : null}

                    {requiresApproval && (
                        <Field label={t('admin:approval_scenarios.approver_roles')} required>
                            {(field) => (rolesLoading ? (
                                <LoadingState layout="inline" label={t('common:loading.roles')} />
                            ) : (
                                <MultiSelect
                                    {...field}
                                    options={selectableRoles}
                                    value={selectedRoles}
                                    onChange={setSelectedRoles}
                                    placeholder={t('admin:approval_scenarios.modal.select_roles')}
                                    formatSummary={(count) => t('admin:approval_scenarios.modal.roles_selected', { count })}
                                />
                            ))}
                        </Field>
                    )}

                    <RiskHubFieldError errorKey={errorKey} />
                </DialogBody>
                <RiskHubModalActions
                    disableSave={rolesLoading || (requiresApproval && selectedRoles.length === 0)}
                    onCancel={onClose}
                    saving={saving}
                />
            </form>
        </RiskHubModalFrame>
    );
}

export function ApprovalScenariosPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canUpdateScenarios = riskHubCapabilityEnabled(riskHubCapabilities?.approval_scenarios, 'can_update');

    const fixedPolicySummary = (scenario: ApprovalScenario): string | null => {
        if (!scenario.fixed_policy) return null;
        const policy = scenario.fixed_policy_definition ?? LEGACY_PROTECTED_PROCESS_FIXED_POLICY;
        return [
            t(`admin:approval_scenarios.fixed_policy.triggers.${policy.threshold}`),
            ...policy.covered_actions.map((action) =>
                t(`admin:approval_scenarios.fixed_policy.covered_action_values.${action}`),
            ),
            t(`admin:approval_scenarios.fixed_policy.self_approval.${String(policy.allow_self_approval)}`),
        ].join(' · ');
    };

    const scenariosResource = useRiskHubConfigResource<ApprovalScenario, ApprovalScenarioUpdate, ApprovalScenarioUpdate>({
        queryKey: riskHubKeys.approvalScenarios(),
        load: () => riskHubApi.getApprovalScenarios(),
        update: (key, data) => riskHubApi.updateApprovalScenario(String(key), data),
        itemId: (scenario) => scenario.key,
        panelCapabilityKey: 'approval_scenarios',
        includeShowInactive: false,
    });

    // Fetch roles from Risk Hub to populate role options dynamically
    const { data: hubRoles, isLoading: rolesLoading } = useQuery({
        queryKey: riskHubKeys.roles(false), // false = active roles only
        queryFn: () => riskHubApi.getRoles(false),
    });

    // Build role options from Risk Hub roles + special dynamic entries
    const roleOptions = useMemo<RoleOption[]>(() => {
        const specialRoleMap: Record<(typeof SPECIAL_ROLE_VALUES)[number], string> = {
            risk_owner: t('admin:approval_scenarios.special_roles.risk_owner_dynamic'),
        };

        // GAP-D-06: approver roles are seeded RBAC codes; show their translated
        // names (`lib/roleLabels`) rather than the stored English display name.
        const fromHub: RoleOption[] = (hubRoles || [])
            .filter(r => isApprovalScenarioApproverRole(r.name))
            .map(r => ({
                value: r.name,
                label: getRoleLabel(r.name, t),
            }));
        // Merge special roles (like risk_owner) and deduplicate
        const specialEntries: RoleOption[] = SPECIAL_ROLE_VALUES.map((value) => ({
            value,
            label: specialRoleMap[value],
        }));
        const specialCodes = new Set(specialEntries.map(r => r.value));
        const merged = [...specialEntries, ...fromHub.filter(r => !specialCodes.has(r.value))];
        return merged;
    }, [hubRoles, t]);

    // Scenario badges: the dynamic risk owner reads without its "(dynamic)" hint.
    const approverRoleLabel = (roleValue: string): string => (
        roleValue === 'risk_owner'
            ? t('admin:approval_scenarios.special_roles.risk_owner')
            : getRoleLabel(roleValue, t)
    );

    // DS-17 / GAP-C-11: shared loading and error (with retry) states.
    if (scenariosResource.isLoading) {
        return <LoadingState label={t('common:loading.scenarios')} />;
    }

    if (scenariosResource.error && !scenariosResource.hasData) {
        return (
            <ErrorState
                message={t('admin:errors.failed_to_load_approval_scenarios')}
                onRetry={scenariosResource.retry}
                isRetrying={scenariosResource.isFetching}
            />
        );
    }

    return (
        <div className="space-y-4">
            {scenariosResource.error ? (
                <ErrorState variant="banner" onRetry={scenariosResource.retry} isRetrying={scenariosResource.isFetching} />
            ) : null}
            <CardHeader
                className="mb-0"
                icon={ShieldCheck}
                title={t('admin:approval_scenarios.title')}
                description={t('admin:approval_scenarios.subtitle')}
            />

            {scenariosResource.items.length === 0 ? (
                <EmptyState title={t('admin:approval_scenarios.empty')} testId="approval-scenarios-empty" />
            ) : (
                <Table density="compact" regionLabel={t('admin:approval_scenarios.title')}>
                    <THead>
                        <TR>
                            <TH>{t('admin:approval_scenarios.columns.scenario')}</TH>
                            <TH>{t('common:labels.description')}</TH>
                            <TH align="center">{t('common:labels.status')}</TH>
                            <TH>{t('admin:approval_scenarios.columns.approvers')}</TH>
                            <TH align="right">{t('common:labels.actions')}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {scenariosResource.items.map((scenario) => (
                            <TR key={scenario.key}>
                                <TD>
                                    <span className="text-foreground font-medium">{scenario.display_name}</span>
                                </TD>
                                <TD className="max-w-xs text-sm text-muted-foreground">
                                    {scenario.description}
                                    {fixedPolicySummary(scenario) ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {fixedPolicySummary(scenario)}
                                        </p>
                                    ) : null}
                                </TD>
                                <TD align="center">
                                    {scenario.requires_approval ? (
                                        <Badge tone="success" icon={Check}>{t('admin:approval_scenarios.enabled')}</Badge>
                                    ) : (
                                        <Badge tone="neutral" icon={X}>{t('admin:approval_scenarios.disabled')}</Badge>
                                    )}
                                </TD>
                                <TD>
                                    <div className="flex flex-wrap gap-1">
                                        {scenario.approver_roles.map((role) => (
                                            <Badge key={role} tone="neutral">{approverRoleLabel(role)}</Badge>
                                        ))}
                                    </div>
                                </TD>
                                <TD align="right">
                                    {canUpdateScenarios && resolveCapabilityFlag(scenario.capabilities, 'can_update') ? (
                                        <Button
                                            variant="outline"
                                            size="compact"
                                            // The row edit names its row ("Configure: {{name}}"); the visible word leads it.
                                            aria-label={t('admin:approval_scenarios.modal.configure', { name: scenario.display_name })}
                                            onClick={() => scenariosResource.openEdit(scenario)}
                                        >
                                            {t('admin:approval_scenarios.configure')}
                                        </Button>
                                    ) : null}
                                </TD>
                            </TR>
                        ))}
                    </TBody>
                </Table>
            )}

            <EditScenarioModal
                isOpen={!!scenariosResource.editingItem}
                onClose={scenariosResource.closeModal}
                scenario={scenariosResource.editingItem}
                availableRoles={roleOptions}
                rolesLoading={rolesLoading}
                onSave={scenariosResource.handleSave}
            />
        </div>
    );
}

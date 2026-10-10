import { RefreshButton } from '@/components/ui/RefreshButton';
import { useTranslation } from '@/i18n/hooks';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import type { DepartmentDetail } from '@/services/departmentApi';

interface DepartmentDetailHeaderProps {
    department: DepartmentDetail;
    /** Department register destination (honours `return_to`, NAV-02). */
    returnTo: string;
    onRefresh: () => void;
}

/** Department detail header on the canonical `EntityDetailHeader` (D7, D14, DS-15, AX-06). */
export function DepartmentDetailHeader({ department, returnTo, onRefresh }: DepartmentDetailHeaderProps) {
    const { t } = useTranslation('common');
    const registerLabel = t('sidebar.departments', { ns: 'navigation' });

    return (
        <EntityDetailHeader
            back={{ label: t('department_detail.back_to_departments'), to: returnTo }}
            breadcrumbs={[
                { label: registerLabel, to: returnTo },
                { label: department.name },
            ]}
            identifier={department.code}
            title={department.name}
            description={department.description}
            actions={<RefreshButton iconOnly variant="outline" onRefresh={onRefresh} />}
        />
    );
}

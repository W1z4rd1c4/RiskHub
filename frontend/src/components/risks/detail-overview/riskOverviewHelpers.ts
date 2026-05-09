import type { RiskControlLink } from '@/types/risk';

export function groupLinkedControls(linkedControls: RiskControlLink[]) {
    return {
        activeControls: linkedControls.filter(
            (link) => link.control?.status !== 'draft' && link.control?.is_archived !== true,
        ),
        draftControls: linkedControls.filter((link) => link.control?.status === 'draft'),
        archivedControls: linkedControls.filter((link) => link.control?.is_archived === true),
    };
}

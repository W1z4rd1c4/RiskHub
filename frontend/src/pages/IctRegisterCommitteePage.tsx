import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';

// FR-P4-3/FR-P4-4 (#64): the ICT Committee now renders as a URL-addressable
// Dashboard tab (/?view=ict-committee) via <IctCommitteeSection>, and
// /ict-register/committee redirects there. This thin wrapper is deliberately
// RETAINED until the redirect is verified so reverting the migration restores
// the standalone page with no dead deep-links (rollback boundary).
export function IctRegisterCommitteePage() {
    return <IctCommitteeSection />;
}

export default IctRegisterCommitteePage;

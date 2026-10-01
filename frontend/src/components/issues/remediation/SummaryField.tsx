import { ISSUE_LABEL } from '../issueUi';

export function SummaryField({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <p className={ISSUE_LABEL}>{label}</p>
            <p className="text-sm text-foreground break-words">{value}</p>
        </div>
    );
}

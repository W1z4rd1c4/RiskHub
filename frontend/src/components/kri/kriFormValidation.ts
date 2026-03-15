import type { KRICreate, KRIUpdate } from '@/types/kri';

export function getKriDraftValidationErrorKey(
    data: Partial<KRICreate & KRIUpdate>,
): string | null {
    if (!data.metric_name?.trim()) {
        return 'kris:form.validation.metric_name_required';
    }
    if (!data.description?.trim()) {
        return 'kris:form.validation.description_required';
    }
    return null;
}

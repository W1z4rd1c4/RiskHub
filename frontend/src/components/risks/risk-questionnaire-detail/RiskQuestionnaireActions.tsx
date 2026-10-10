import { Save, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireActionsProps {
    canSaveDraft: boolean;
    canSubmitQuestionnaire: boolean;
    isEditable: boolean;
    onClose: () => void;
    onSave: () => void;
    onSubmit: () => void;
    saving: boolean;
    submitting: boolean;
    t: TranslateFn;
}

export function RiskQuestionnaireActions({
    canSaveDraft,
    canSubmitQuestionnaire,
    isEditable,
    onClose,
    onSave,
    onSubmit,
    saving,
    submitting,
    t,
}: RiskQuestionnaireActionsProps) {
    return (
        <DialogFooter
            className="flex-wrap"
            extra={!isEditable ? (
                <span className="text-xs text-muted-foreground">{t('risks:questionnaire.readonly_hint')}</span>
            ) : undefined}
        >
            <Button type="button" variant="secondary" onClick={onClose}>
                {t('common:actions.close')}
            </Button>
            {isEditable && canSaveDraft && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onSave}
                    disabled={saving || submitting}
                    isLoading={saving}
                >
                    {saving ? null : <Save aria-hidden="true" />}
                    {t('risks:questionnaire.actions.save')}
                </Button>
            )}
            {isEditable && canSubmitQuestionnaire && (
                <Button
                    type="button"
                    variant="accent"
                    onClick={onSubmit}
                    disabled={saving || submitting}
                    isLoading={submitting}
                >
                    {submitting ? null : <Send aria-hidden="true" />}
                    {t('common:actions.submit')}
                </Button>
            )}
        </DialogFooter>
    );
}

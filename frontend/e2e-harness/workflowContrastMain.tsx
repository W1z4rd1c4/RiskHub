import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KRIDetailHistoryTab } from '@/components/kris/KRIDetailHistoryTab';
import { ApprovalResolutionDialog } from '@/pages/approvals/ApprovalResolutionDialog';
import { RiskFormOwnershipStep } from '@/components/risk-form/RiskFormOwnershipStep';
import { RiskQuestionnaireActions } from '@/components/risks/risk-questionnaire-detail/RiskQuestionnaireActions';
import i18n from '@/i18n';
import type { Risk } from '@/types/risk';
import type { ApprovalRequest } from '@/types/approval';
import type { SafeTFunction } from '@/i18n/hooks';
import '@/index.css';

const params = new URLSearchParams(location.search);
const family = params.get('family') ?? 'history';
const state = params.get('state') ?? 'normal';
const locale = params.get('locale') ?? 'en';
localStorage.setItem('riskhub-theme', params.get('theme') ?? 'light');
document.documentElement.lang = locale;
await i18n.changeLanguage(locale);
const t = i18n.getFixedT(locale, family === 'approval' ? 'approvals' : 'risks') as SafeTFunction;
const users = [{ id: 1, name: 'Alice Novak', email: 'alice@example.test', role_name: 'risk_manager', department_id: 1 }];
const history = [
  { id: 1, kri_id: 1, period_start: '2026-07-01', period_end: '2026-07-31', recorded_at: '2026-08-01T10:00:00Z', value: state === 'breach' ? 8 : 12, lower_limit: 0, upper_limit: 10, unit: '%', breach_status: state === 'breach' ? 'within' : 'above', recorded_by_name: 'Alice Novak' },
  { id: 2, kri_id: 1, period_start: '2026-08-01', period_end: '2026-08-31', recorded_at: '2026-09-01T10:00:00Z', value: state === 'breach' ? 12 : 8, lower_limit: 0, upper_limit: 11, unit: '%', breach_status: state === 'breach' ? 'above' : 'within', recorded_by_name: 'Alice Novak' },
];

function Workflow() {
  const [notes, setNotes] = useState(state === 'pending' ? 'Reviewed and confirmed.' : '');
  const [formData, setFormData] = useState<Partial<Risk>>({ department_id: 1, owner_id: state === 'selected' ? 1 : null, owner: state === 'selected' ? users[0] : undefined, is_priority: state === 'selected' });
  const [search, setSearch] = useState(state === 'empty' ? 'Nobody matches' : '');
  const [role, setRole] = useState('');
  const [error, setError] = useState(state === 'error' ? t('dialogs.resolution_required') : null);
  const [outcome, setOutcome] = useState('');
  const pending = state === 'pending';
  const noop = () => undefined;
  return (
    <>
      <output aria-live="polite">{outcome}</output>
      {family === 'history' && (
        <KRIDetailHistoryTab
          history={state === 'empty' ? [] : history}
          historyTotal={state === 'empty' ? 0 : 2}
          isLoadingHistory={false}
          lowerLimit={0}
          upperLimit={10}
          unit="%"
          onSelectEntry={() => setOutcome('correction')}
          canRequestCorrection
          outcome={{ kind: 'content', isRefreshing: false }}
          onRetry={noop}
        />
      )}
      {family === 'approval' && (
        <ApprovalResolutionDialog
          selectedApproval={{
            id: 1,
            action_type: 'create',
            resource_type: 'risk',
            resource_name: 'Operations Risk',
            reason: 'Review new exposure',
            requested_by_name: 'Alice Novak',
            pending_changes: null,
          } as ApprovalRequest}
          dialogMode={state === 'reject' ? 'reject' : 'approve'}
          locale={locale}
          resolutionNotes={notes}
          errorText={error}
          isSubmitting={pending}
          onClose={() => setOutcome('closed')}
          onResolve={() => notes.trim() ? setOutcome('resolved') : setError(t('dialogs.resolution_required'))}
          onResolutionNotesChange={setNotes}
          t={t}
        />
      )}
      {family === 'owner' && (
        <div className="glass-card">
          <RiskFormOwnershipStep
            t={t}
            formData={formData}
            fieldErrors={state === 'error' ? {
              owner_id: t('form.placeholders.search_by_name'),
              department_id: t('form.placeholders.select_department'),
            } : {}}
            departments={[{ id: 1, name: 'Operations', code: 'OPS' }]}
            ownerLookupStatus={state === 'loading' ? 'loading' : state === 'lookup-error' ? 'error' : 'ready'}
            ownerResultsLimited={state === 'limited'}
            ownerResultsHiddenByRole={false}
            retryOwnerSearch={() => setOutcome('retry')}
            selectOwner={(owner) => setFormData(current => ({ ...current, owner_id: owner.id, owner }))}
            filteredUsers={users.filter(user => user.name.toLowerCase().includes(search.toLowerCase()))}
            uniqueRoles={['risk_manager']}
            ownerSearch={search}
            roleFilter={role}
            setOwnerSearch={setSearch}
            setRoleFilter={setRole}
            handleInputChange={(field, value) => setFormData(current => ({ ...current, [field]: value }))}
          />
        </div>
      )}
      {family === 'questionnaire' && (
        <div className="glass-card">
          <RiskQuestionnaireActions
            canSaveDraft
            canSubmitQuestionnaire
            isEditable={state !== 'readonly'}
            onClose={() => setOutcome('closed')}
            onSave={() => setOutcome('saved')}
            onSubmit={() => setOutcome('submitted')}
            saving={pending}
            submitting={state === 'submitting'}
            t={t}
          />
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <ThemeProvider><Workflow /></ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>,
);

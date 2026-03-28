import type { Dispatch, SetStateAction } from 'react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { formatDateTimeValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { RiskQuestionnaireClarification } from '@/types/riskQuestionnaire';

interface TemplateQuestion {
  key: string;
  required: boolean;
  type: 'boolean' | 'single_select' | 'text' | 'number' | 'textarea';
  options?: string[];
  helperTextKey?: string;
}

interface TemplateSection {
  titleKey: string;
  questions: TemplateQuestion[];
}

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface RiskQuestionnaireSectionListProps {
  t: TranslateFn;
  locale: string;
  template: TemplateSection[];
  canRequestClarification: boolean;
  questionnaireStatus?: string;
  requestingSectionKey: string | null;
  setRequestingSectionKey: (value: string | null) => void;
  requestMessage: string;
  setRequestMessage: (value: string) => void;
  requestQuestionKeys: string[];
  setRequestQuestionKeys: (value: string[]) => void;
  handleRequestClarification: (sectionKey: string) => Promise<void>;
  clarificationsLoading: boolean;
  sectionClarifications: Map<string, RiskQuestionnaireClarification[]>;
  isRiskOwner: boolean;
  respondingClarificationId: number | null;
  setRespondingClarificationId: (value: number | null) => void;
  responseMessage: string;
  setResponseMessage: (value: string) => void;
  handleRespondClarification: (clarificationId: number) => Promise<void>;
  isEditable: boolean;
  answers: Record<string, unknown>;
  setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
  missingKeys: string[];
  isChanged: (key: string) => boolean;
  renderAnswer: (key: string, value: unknown) => string;
  getPreviousAnswer: (key: string) => unknown;
  likelihoodQuestionKey: string;
  worstCaseImpactQuestionKey: string;
  likelihoodOptions: Array<{ value: string; label: string }>;
  worstCaseImpactOptions: Array<{ value: string; label: string }>;
}

export function RiskQuestionnaireSectionList({
  t,
  locale,
  template,
  canRequestClarification,
  questionnaireStatus,
  requestingSectionKey,
  setRequestingSectionKey,
  requestMessage,
  setRequestMessage,
  requestQuestionKeys,
  setRequestQuestionKeys,
  handleRequestClarification,
  clarificationsLoading,
  sectionClarifications,
  isRiskOwner,
  respondingClarificationId,
  setRespondingClarificationId,
  responseMessage,
  setResponseMessage,
  handleRespondClarification,
  isEditable,
  answers,
  setAnswers,
  missingKeys,
  isChanged,
  renderAnswer,
  getPreviousAnswer,
  likelihoodQuestionKey,
  worstCaseImpactQuestionKey,
  likelihoodOptions,
  worstCaseImpactOptions,
}: RiskQuestionnaireSectionListProps) {
  return (
    <>
      {template.map((section) => (
        <section key={section.titleKey} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-black text-white uppercase tracking-widest">
              {t(`risks:${section.titleKey}`, section.titleKey)}
            </h4>
            {canRequestClarification && questionnaireStatus === 'submitted' && (
              <button
                onClick={() => {
                  setRequestingSectionKey(section.titleKey);
                  setRequestMessage('');
                  setRequestQuestionKeys([]);
                }}
                className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-accent/80"
              >
                {t('risks:questionnaire.request_clarification')}
              </button>
            )}
          </div>

          {requestingSectionKey === section.titleKey && (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
              <p className="text-xs font-bold text-slate-300">
                {t('risks:questionnaire.clarification_request_label')}
              </p>
              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                placeholder={t('risks:questionnaire.clarification_request_placeholder')}
              />
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {t('risks:questionnaire.clarification_optional_questions')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {section.questions.map((q) => {
                    const label = t(`risks:questionnaire.questions.${q.key}`, q.key);
                    const checked = requestQuestionKeys.includes(q.key);
                    return (
                      <label key={q.key} className="flex items-start gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...requestQuestionKeys, q.key]
                              : requestQuestionKeys.filter((k) => k !== q.key);
                            setRequestQuestionKeys(next);
                          }}
                        />
                        <span className="leading-snug">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setRequestingSectionKey(null)}
                  className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={() => void handleRequestClarification(section.titleKey)}
                  disabled={requestMessage.trim() === ''}
                  className={cn(
                    'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
                    'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                    requestMessage.trim() === '' && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {t('common:actions.submit')}
                </button>
              </div>
            </div>
          )}

          {clarificationsLoading ? null : (sectionClarifications.get(section.titleKey)?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {sectionClarifications.get(section.titleKey)!.map((c) => {
                const open = !c.response_message;
                return (
                  <div key={c.id} className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-slate-300">
                        {t('risks:questionnaire.clarification')}
                      </p>
                      {open && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          {t('risks:questionnaire.clarification_open')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white whitespace-pre-wrap">{c.request_message}</p>
                    <p className="text-[10px] text-slate-500">
                      {t('risks:questionnaire.clarification_requested_by')}{' '}
                      {c.requested_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                      {formatDateTimeValue(c.requested_at, locale)}
                    </p>

                    {c.response_message ? (
                      <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
                        <p className="text-xs font-bold text-slate-300">
                          {t('risks:questionnaire.clarification_response')}
                        </p>
                        <p className="text-sm text-white whitespace-pre-wrap">{c.response_message}</p>
                        {c.responded_at && (
                          <p className="text-[10px] text-slate-500">
                            {t('risks:questionnaire.clarification_responded_by')}{' '}
                            {c.responded_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                            {formatDateTimeValue(c.responded_at, locale)}
                          </p>
                        )}
                      </div>
                    ) : isRiskOwner ? (
                      <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                        {respondingClarificationId !== c.id ? (
                          <button
                            onClick={() => {
                              setRespondingClarificationId(c.id);
                              setResponseMessage('');
                            }}
                            className="text-xs text-accent hover:text-accent/80 font-bold"
                          >
                            {t('risks:questionnaire.respond')}
                          </button>
                        ) : (
                          <>
                            <textarea
                              value={responseMessage}
                              onChange={(e) => setResponseMessage(e.target.value)}
                              rows={3}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                              placeholder={t('risks:questionnaire.clarification_response_placeholder')}
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setRespondingClarificationId(null)}
                                className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                              >
                                {t('common:actions.cancel')}
                              </button>
                              <button
                                onClick={() => void handleRespondClarification(c.id)}
                                disabled={responseMessage.trim() === ''}
                                className={cn(
                                  'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
                                  'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                                  responseMessage.trim() === '' && 'opacity-50 cursor-not-allowed',
                                )}
                              >
                                {t('common:actions.submit')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.questions.map((q) => {
              const label = t(`risks:questionnaire.questions.${q.key}`, q.key);
              const value = answers[q.key];
              const required = q.required;
              const missing = missingKeys.includes(q.key);
              const spanFullWidth = q.type === 'textarea';
              const changed = isChanged(q.key);
              const helperText = q.helperTextKey ? t(`risks:${q.helperTextKey}`, '') : '';

              if (!isEditable) {
                return (
                  <div
                    key={q.key}
                    className={cn('space-y-1', spanFullWidth && 'md:col-span-2')}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-300">
                        {label}
                      </p>
                      {changed && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                          {t('risks:questionnaire.changed')}
                        </span>
                      )}
                      {required && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {t('risks:questionnaire.required')}
                        </span>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white">
                      {renderAnswer(q.key, value)}
                    </div>
                    {changed && (
                      <div className="text-xs text-slate-500">
                        {t('risks:questionnaire.previous')}: {renderAnswer(q.key, getPreviousAnswer(q.key))}
                      </div>
                    )}
                    {helperText && (
                      <div className="text-xs text-slate-500">{helperText}</div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={q.key}
                  className={cn('space-y-1', spanFullWidth && 'md:col-span-2')}
                >
                  <div className="flex items-center gap-2">
                    <p className={cn('text-xs font-bold', missing ? 'text-rose-400' : 'text-slate-300')}>
                      {label}
                    </p>
                    {changed && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                        {t('risks:questionnaire.changed')}
                      </span>
                    )}
                    {required && (
                      <span className={cn('text-[10px] font-black uppercase tracking-widest', missing ? 'text-rose-400' : 'text-slate-500')}>
                        {t('risks:questionnaire.required')}
                      </span>
                    )}
                  </div>

                  {helperText && (
                    <div className="text-xs text-slate-500">{helperText}</div>
                  )}

                  {(q.key === likelihoodQuestionKey || q.key === worstCaseImpactQuestionKey) && (
                    <ThemedSelect
                      value={typeof value === 'number' ? String(value) : ''}
                      onValueChange={(v) => {
                        setAnswers((prev) => ({
                          ...prev,
                          [q.key]: v === '' ? undefined : Number.parseInt(v, 10),
                        }));
                      }}
                      placeholder={t('common:actions.select')}
                      allowEmpty
                      emptyLabel={t('common:labels.none')}
                      className={cn(
                        missing && 'border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/30',
                      )}
                      options={q.key === likelihoodQuestionKey ? likelihoodOptions : worstCaseImpactOptions}
                    />
                  )}

                  {q.type === 'boolean' && (
                    <ThemedSelect
                      value={typeof value === 'boolean' ? String(value) : ''}
                      onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v === 'true' }))}
                      placeholder={t('common:actions.select')}
                      allowEmpty
                      emptyLabel={t('common:labels.none')}
                      options={[
                        { value: 'true', label: t('common:actions.yes') },
                        { value: 'false', label: t('common:actions.no') },
                      ]}
                    />
                  )}

                  {q.type === 'single_select' && (
                    <ThemedSelect
                      value={typeof value === 'string' ? value : ''}
                      onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))}
                      placeholder={t('common:actions.select')}
                      allowEmpty
                      emptyLabel={t('common:labels.none')}
                      options={(q.options ?? []).map((opt) => ({
                        value: opt,
                        label: t(`risks:questionnaire.questions.${opt}`, opt),
                      }))}
                    />
                  )}

                  {q.type === 'text' && (
                    <input
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                      className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                      )}
                    />
                  )}

                  {q.type === 'number' && q.key !== likelihoodQuestionKey && q.key !== worstCaseImpactQuestionKey && (
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      value={typeof value === 'number' ? String(value) : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setAnswers((prev) => ({
                          ...prev,
                          [q.key]: raw === '' ? undefined : Number.parseInt(raw, 10),
                        }));
                      }}
                      className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                      )}
                    />
                  )}

                  {q.type === 'textarea' && (
                    <textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                      rows={3}
                      className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all resize-none',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                      )}
                    />
                  )}

                  {changed && (
                    <div className="text-xs text-slate-500">
                      {t('risks:questionnaire.previous')}: {renderAnswer(q.key, getPreviousAnswer(q.key))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

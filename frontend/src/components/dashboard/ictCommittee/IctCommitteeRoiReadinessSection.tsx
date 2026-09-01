import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

import type { IctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';

type RoiPresentation = IctCommitteePresentation['roiReadiness'];
type RoiTemplatePresentation = RoiPresentation['templates'][number];

function RoiTemplateReadiness({
    expanded,
    onToggle,
    template,
}: {
    expanded: boolean;
    onToggle: () => void;
    template: RoiTemplatePresentation;
}) {
    if (template.documentary) {
        return <p className="text-muted-foreground text-sm italic">{template.note}</p>;
    }

    if (template.rowCount === 0) {
        return <p className="text-muted-foreground text-sm">{template.noRowsLabel}</p>;
    }

    return (
        <>
            <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                        data-testid={`committee-roi-bar-${template.code}`}
                        className={`h-full rounded-full ${template.readinessBarClass}`}
                        initial={false}
                        animate={{ width: `${template.readinessPct ?? 0}%` }}
                        transition={{ duration: 0 }}
                    />
                </div>
                <span className="text-white font-bold tabular-nums text-sm w-16 text-right">
                    {template.readinessLabel}
                </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 font-medium">
                <span>{template.rowCountLabel}</span>
                {template.gapRowCount > 0 ? (
                    <button
                        type="button"
                        data-testid={`committee-roi-toggle-${template.code}`}
                        aria-expanded={expanded}
                        aria-controls={`committee-roi-gaps-${template.code}`}
                        onClick={onToggle}
                        className="text-slate-400 hover:text-accent font-bold underline decoration-white/20 hover:decoration-accent"
                    >
                        {expanded ? template.hideGapsLabel : template.showGapsLabel} ({template.gapCountLabel})
                    </button>
                ) : (
                    <span>{template.noGapsLabel}</span>
                )}
            </div>
        </>
    );
}

function RoiTemplateRow({ template }: { template: RoiTemplatePresentation }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="py-3 first:pt-0 last:pb-0" data-testid={`committee-roi-template-${template.code}`}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="lg:w-2/5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400">{template.code}</span>
                        <span
                            title={template.coverageHint}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${template.coverageClass}`}
                        >
                            {template.coverageLabel}
                        </span>
                    </div>
                    <p className={`font-semibold mt-0.5 ${template.documentary ? 'text-slate-400' : 'text-slate-200'}`}>
                        {template.name}
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">{template.feedAndGate}</p>
                </div>
                <div className="flex-1">
                    <RoiTemplateReadiness
                        expanded={expanded}
                        onToggle={() => setExpanded((value) => !value)}
                        template={template}
                    />
                </div>
            </div>
            {expanded && template.gapRows.length > 0 && (
                <div
                    id={`committee-roi-gaps-${template.code}`}
                    data-testid={`committee-roi-gaps-${template.code}`}
                    className="mt-3 space-y-2 border-t border-white/5 pt-3"
                >
                    {template.truncatedLabel && (
                        <p className="text-muted-foreground text-xs italic">{template.truncatedLabel}</p>
                    )}
                    {template.gapRows.map((row) => (
                        <div key={row.key} className="flex flex-col md:flex-row md:items-baseline gap-1.5 md:gap-3">
                            <div className="md:w-2/5 text-sm">
                                {row.href ? (
                                    <Link
                                        to={row.href}
                                        className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                    >
                                        {row.label}
                                    </Link>
                                ) : (
                                    <span className="text-slate-300 font-semibold">{row.label}</span>
                                )}
                            </div>
                            <div className="flex-1 flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground text-xs">{row.missingLabel}</span>
                                {row.missing.map((missing) => (
                                    <span
                                        key={missing.key}
                                        title={missing.title}
                                        className="px-2 py-0.5 rounded-lg bg-white/5 text-slate-300 text-xs font-semibold font-mono whitespace-nowrap"
                                    >
                                        {missing.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function IctCommitteeRoiReadinessSection({ presentation }: { presentation: RoiPresentation }) {
    return (
        <section className="space-y-4" data-testid="committee-roi">
            <div>
                <h2 className="text-xl font-bold text-white">{presentation.title}</h2>
                <p className="text-muted-foreground text-sm font-medium mt-1">{presentation.subtitle}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card" data-testid="committee-roi-overall">
                    <p className="text-muted-foreground text-xs font-bold min-h-8">{presentation.overallLabel}</p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums">{presentation.overallValue}</p>
                </div>
                <div className="glass-card" data-testid="committee-roi-total-gaps">
                    <p className="text-muted-foreground text-xs font-bold min-h-8">{presentation.totalGapsLabel}</p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums">{presentation.totalGapsValue}</p>
                </div>
            </div>
            <div className="glass-card divide-y divide-white/5">
                {presentation.templates.map((template) => (
                    <RoiTemplateRow key={template.code} template={template} />
                ))}
            </div>
        </section>
    );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, FileText, ChevronLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { adminApi } from '@/services/adminApi';

export function DocumentationPage() {
    const { t, i18n } = useTranslation('common');
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

    const { data: docsData, isLoading } = useQuery({
        queryKey: ['adminDocs', i18n.language],
        queryFn: () => adminApi.getDocs(i18n.language),
    });

    const docs = docsData?.documents || [];
    const activeDoc = docs.find(d => d.id === selectedDocId);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                <p>{t('loading.platform_docs')}</p>
            </div>
        );
    }

    if (docs.length === 0) {
        return (
                <div className="glass-card flex flex-col items-center justify-center py-24 text-slate-500">
                    <BookOpen className="h-16 w-16 mb-4 opacity-10" />
                    <h3 className="text-xl font-semibold text-white mb-2">{t('empty.no_documentation')}</h3>
                    <p>{t('documentation.no_manuals_seeded')}</p>
                </div>
            );
        }

    // Detail View
    if (activeDoc) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setSelectedDocId(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm font-medium rounded-xl transition-all border border-white/10"
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('documentation.back_to_library')}
                </button>

                <div className="glass-card min-h-[600px] flex flex-col overflow-hidden">
                    <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                        <div>
                            <h2 className="text-2xl font-bold text-white">{activeDoc.title}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded">{t('documentation.platform_manual')}</span>
                                <span className="text-[10px] text-slate-500">v1.0.0</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-10">
                        <article className="prose prose-invert prose-slate prose-headings:text-white prose-a:text-accent prose-pre:bg-slate-900/50 prose-pre:border prose-pre:border-white/10 prose-table:border prose-table:border-white/10 prose-th:bg-white/5 prose-th:p-2 prose-td:p-2 prose-td:border-t prose-td:border-white/10 max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeDoc.content || ''}</ReactMarkdown>
                        </article>
                    </div>
                </div>
            </div>
        );
    }

    // Grid View
    return (
        <div className="space-y-8">
            <header className="glass-card p-8">
                <div className="flex items-center gap-6">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-xl">
                        <BookOpen className="h-10 w-10 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white font-heading">{t('documentation.library_title')}</h1>
                        <p className="text-slate-400 text-lg mt-1">
                            {t('documentation.library_subtitle')}
                        </p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {docs.map((doc) => (
                    <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="glass-card p-6 flex flex-col text-left group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300"
                    >
                        <div className="bg-white/5 p-3 rounded-xl w-fit mb-4 group-hover:bg-accent/20 transition-colors">
                            <FileText className="h-6 w-6 text-slate-400 group-hover:text-accent transition-colors" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-accent transition-colors">{doc.title}</h3>
                        <p className="text-sm text-slate-500 mb-6 flex-1 line-clamp-3">
                            {doc.content.replace(/[#*`]/g, '').slice(0, 150)}...
                        </p>
                        <div className="flex items-center gap-2 text-accent text-sm font-semibold mt-auto">
                            {t('documentation.view_manual')}
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

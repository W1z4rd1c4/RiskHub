import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { BookOpen, FileText, ChevronRight, Download, Search } from 'lucide-react';
import { adminApi } from '@/services/adminApi';
import { cn } from '@/lib/utils';

export function DocumentationPage() {
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const { data: docsData, isLoading } = useQuery({
        queryKey: ['adminDocs'],
        queryFn: () => adminApi.getDocs(),
    });

    const docs = docsData?.documents || [];
    const filteredDocs = docs.filter(doc =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeDoc = docs.find(d => d.id === selectedDocId) || docs[0];

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                <p>Loading platform documentation...</p>
            </div>
        );
    }

    if (docs.length === 0) {
        return (
            <div className="glass-card flex flex-col items-center justify-center py-24 text-slate-500">
                <BookOpen className="h-16 w-16 mb-4 opacity-10" />
                <h3 className="text-xl font-semibold text-white mb-2">No Documentation Available</h3>
                <p>There are currently no instruction manuals seeded in the platform.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
                        <BookOpen className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-heading">Platform Documentation</h1>
                        <p className="text-slate-400">
                            Instruction manuals, technical guides, and SIEM integration references
                        </p>
                    </div>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Side Navigation */}
                <div className="lg:w-80 flex-shrink-0 space-y-4">
                    <div className="glass-card p-4">
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search manuals..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent transition-all"
                            />
                        </div>

                        <div className="space-y-1">
                            {filteredDocs.map((doc) => {
                                const isActive = (selectedDocId === doc.id) || (!selectedDocId && doc.id === docs[0].id);
                                return (
                                    <button
                                        key={doc.id}
                                        onClick={() => setSelectedDocId(doc.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all text-sm",
                                            isActive
                                                ? "bg-accent text-white shadow-lg shadow-accent/20"
                                                : "text-slate-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileText className={cn("h-4 w-4", isActive ? "text-white" : "text-slate-500")} />
                                            <span className="font-medium truncate">{doc.title}</span>
                                        </div>
                                        {isActive && <ChevronRight className="h-4 w-4 text-white opacity-50" />}
                                    </button>
                                );
                            })}
                            {filteredDocs.length === 0 && (
                                <p className="text-center py-4 text-xs text-slate-600">No matching documents</p>
                            )}
                        </div>
                    </div>

                    <div className="glass-card p-4 bg-gradient-to-br from-accent/10 to-transparent border-accent/20">
                        <h4 className="text-sm font-semibold text-white mb-2">Need Support?</h4>
                        <p className="text-xs text-slate-400 leading-relaxed mb-4">
                            If you encounter technical issues not covered in these guides, please contact the platform DevOps team.
                        </p>
                        <button className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors">
                            Contact Support
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    <div className="glass-card min-h-[600px] flex flex-col overflow-hidden">
                        <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{activeDoc?.title}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded">Platform Manual</span>
                                    <span className="text-[10px] text-slate-500">v1.0.0</span>
                                </div>
                            </div>
                            <button
                                onClick={() => window.print()}
                                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-sm font-medium rounded-xl transition-all border border-white/10"
                            >
                                <Download className="h-4 w-4" />
                                Export PDF
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10">
                            <article className="prose prose-invert prose-slate prose-headings:text-white prose-a:text-accent prose-pre:bg-slate-900/50 prose-pre:border prose-pre:border-white/10 max-w-none">
                                <ReactMarkdown>{activeDoc?.content || ''}</ReactMarkdown>
                            </article>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

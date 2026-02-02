import { useState } from 'react';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import type { VendorDependencyGraphNode } from '@/types/vendorDependency';

interface NodeProps {
    node: VendorDependencyGraphNode;
    depth: number;
}

function Node({ node, depth }: NodeProps) {
    const [open, setOpen] = useState(depth < 1);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="space-y-1">
            <button
                onClick={() => hasChildren && setOpen((v) => !v)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${depth === 0
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.03]'
                    }`}
                style={{ marginLeft: depth * 12 }}
            >
                <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-accent" />
                    <div>
                        <p className="text-sm text-white font-bold">{node.vendor_name}</p>
                        {node.relationship_type && (
                            <p className="text-xs text-slate-500 font-medium">{node.relationship_type}</p>
                        )}
                    </div>
                </div>
                {hasChildren && (
                    <div className="text-slate-500">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                )}
            </button>

            {open && hasChildren && (
                <div className="space-y-2">
                    {node.children.map((c) => (
                        <Node key={c.vendor_id} node={c} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function VendorDependencyGraph({ root }: { root: VendorDependencyGraphNode }) {
    return (
        <div className="space-y-2">
            <Node node={root} depth={0} />
        </div>
    );
}


import { useState } from 'react';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import type { VendorDependencyGraphNode } from '@/types/vendorDependency';
import { cn } from '@/lib/utils';

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
                className={cn(
                    'vendor-tree-node w-full text-left',
                    depth === 0 && 'vendor-tree-node--root',
                )}
                style={{ marginLeft: depth * 12 }}
            >
                <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-accent" />
                    <div>
                        <p className="vendor-card__title">{node.vendor_name}</p>
                        {node.relationship_type && (
                            <p className="vendor-card__meta">{node.relationship_type}</p>
                        )}
                    </div>
                </div>
                {hasChildren ? (
                    <div className="vendor-muted">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                ) : null}
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

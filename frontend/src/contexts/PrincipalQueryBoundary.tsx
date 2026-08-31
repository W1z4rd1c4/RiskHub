import { useLayoutEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { createAppQueryClient } from '@/lib/queryClient';

interface PrincipalQueryBoundaryProps {
    principalId: number | null;
    children: ReactNode;
}

function PrincipalQueryGeneration({ children }: { children: ReactNode }) {
    const [client] = useState(createAppQueryClient);

    useLayoutEffect(() => () => {
        void client.cancelQueries();
        client.clear();
    }, [client]);

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function PrincipalQueryBoundary({
    principalId,
    children,
}: PrincipalQueryBoundaryProps) {
    return (
        <PrincipalQueryGeneration key={principalId ?? 'anonymous'}>
            {children}
        </PrincipalQueryGeneration>
    );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

import i18n from '@/i18n';

type ErrorBoundaryProps = {
    children: ReactNode;
    resetKey?: string;
};

type ErrorBoundaryState = {
    error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        error: null,
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
        // React logs component stacks in development; the boundary keeps the UI recoverable.
    }

    componentDidUpdate(previousProps: ErrorBoundaryProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    private reset = () => {
        this.setState({ error: null });
    };

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        const title = i18n.t('error_boundary.title');
        const description = i18n.t('error_boundary.description');
        const retryLabel = i18n.t('actions.retry');

        return (
            <section
                role="alert"
                aria-labelledby="route-error-boundary-title"
                aria-describedby="route-error-boundary-description"
                className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
            >
                <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
                    <h1 id="route-error-boundary-title" className="text-xl font-semibold">
                        {title}
                    </h1>
                    <p id="route-error-boundary-description" className="mt-2 text-sm text-muted-foreground">
                        {description}
                    </p>
                    <button
                        type="button"
                        onClick={this.reset}
                        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        {retryLabel}
                    </button>
                </div>
            </section>
        );
    }
}

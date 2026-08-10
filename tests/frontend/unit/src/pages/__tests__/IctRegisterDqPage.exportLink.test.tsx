import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IctRegisterDqPage } from '@/pages/IctRegisterDqPage';
import { DQ_STATUS_OK } from '@/pages/ictRegisterDq/dqPresentation';
import i18n from '@/i18n';
import type { VendorReportCapabilities } from '@/types/vendorReport';

const getDataQuality = vi.fn();
const getCapabilities = vi.fn();

vi.mock('@/services/ictRegisterDqApi', () => ({
    ictRegisterDqApi: {
        getDataQuality: (...args: unknown[]) => getDataQuality(...args),
    },
}));

vi.mock('@/services/vendorReportApi', () => ({
    vendorReportApi: {
        getCapabilities: (...args: unknown[]) => getCapabilities(...args),
    },
}));

// N21: the export link gates ONLY on can_download_dora_register (from the
// separate vendor_report_capabilities = reports:read + role) — not on the DQ
// page's own read capability. The other flags are deliberately independent.
function reportCapabilities(canDownloadDora: boolean): VendorReportCapabilities {
    return {
        can_read: true,
        can_download_annual_report: false,
        can_download_dora_register: canDownloadDora,
        can_use_department_filter: false,
    };
}

beforeEach(() => {
    getDataQuality.mockReset();
    getCapabilities.mockReset();
    getDataQuality.mockResolvedValue({
        checks: [
            {
                check_id: 'DQ-01',
                area: 'Procesy',
                title_cs: 'Proces bez vlastníka',
                severity: 'Vysoká',
                threshold: 0,
                count: 0,
                status: DQ_STATUS_OK,
                violating_rows: [],
            },
        ],
        finding_count: 0,
    });
});

afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
});

function renderPage() {
    return render(
        <MemoryRouter>
            <IctRegisterDqPage />
        </MemoryRouter>,
    );
}

describe('IctRegisterDqPage — capability-gated register export link (FR-P5-8 / N21 / S2)', () => {
    it('links to the register export when can_download_dora_register is granted', async () => {
        getCapabilities.mockResolvedValue(reportCapabilities(true));

        renderPage();

        const link = await screen.findByTestId('register-export-link');
        expect(link).toHaveAttribute('href', '/vendor-reports');
        expect(link).toHaveTextContent('Download DORA register');
    });

    it('hides the export link when can_download_dora_register is denied', async () => {
        getCapabilities.mockResolvedValue(reportCapabilities(false));

        renderPage();

        // The page renders; the capability probe was consulted and returned false.
        await screen.findByTestId('dq-summary-total');
        await waitFor(() => expect(getCapabilities).toHaveBeenCalled());
        expect(screen.queryByTestId('register-export-link')).not.toBeInTheDocument();
    });

    it('fails closed (no link) when the capability probe errors', async () => {
        getCapabilities.mockRejectedValue(new Error('network'));

        renderPage();

        await screen.findByTestId('dq-summary-total');
        await waitFor(() => expect(getCapabilities).toHaveBeenCalled());
        expect(screen.queryByTestId('register-export-link')).not.toBeInTheDocument();
    });
});

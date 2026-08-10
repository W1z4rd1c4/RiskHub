import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteRequest } = vi.hoisted(() => ({ deleteRequest: vi.fn() }));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        delete: deleteRequest,
    },
}));

import { vendorContractApi } from '@/services/vendorContractApi';

describe('vendorContractApi archive transport', () => {
    beforeEach(() => {
        deleteRequest.mockReset();
    });

    it('sends the governed request reason in the DELETE body and accepts queued approval', async () => {
        const queued = {
            status: 'approval_required',
            approval_id: 42,
            proposal_id: 'proposal-42',
            proposal_version: 1,
        };
        deleteRequest.mockResolvedValue(queued);

        await expect(vendorContractApi.archiveContract(7, 11, 'Review archive'))
            .resolves.toEqual(queued);

        expect(deleteRequest).toHaveBeenCalledWith('/vendors/7/contracts/11', expect.objectContaining({
            body: JSON.stringify({ request_reason: 'Review archive' }),
        }));
    });
});

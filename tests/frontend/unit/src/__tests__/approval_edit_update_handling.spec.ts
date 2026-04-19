/**
 * Unit Tests: Approval Edit/Update Handling
 * 
 * Tests that 202 approval-queued responses are properly handled in update flows.
 * These tests verify the UI behavior when an edit requires approval.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseUpdateResult, getApprovalBannerMessage } from '@/lib/approvalUi';
import { isApprovalCreatedResponse } from '@/types/approval';

describe('approvalUi helpers', () => {
    describe('parseUpdateResult', () => {
        it('should return kind "applied" for non-202 responses', () => {
            const result = parseUpdateResult({ id: 1, name: 'Updated Risk' });
            expect(result.kind).toBe('applied');
        });

        it('should return kind "applied" for null response', () => {
            const result = parseUpdateResult(null);
            expect(result.kind).toBe('applied');
        });

        it('should return kind "applied" for undefined response', () => {
            const result = parseUpdateResult(undefined);
            expect(result.kind).toBe('applied');
        });

        it('should return kind "approval" for 202 approval response', () => {
            const response = {
                status: 'approval_required' as const,
                approval_id: 42,
                message: 'Edit requires approval',
                action_type: 'edit' as const,
                pending_fields: [],
            };
            const result = parseUpdateResult(response);
            expect(result.kind).toBe('approval');
            if (result.kind === 'approval') {
                expect(result.approvalId).toBe(42);
                expect(result.message).toBe('Edit requires approval');
            }
        });

        it('should treat stale legacy approval shapes as applied results', () => {
            const response = {
                approval_id: 99,
            };
            const result = parseUpdateResult(response);
            expect(result.kind).toBe('applied');
        });
    });

    describe('getApprovalBannerMessage', () => {
        it('should format message with approval ID', () => {
            const message = getApprovalBannerMessage(123);
            expect(message).toContain('123');
            expect(message).toContain('Submitted for approval');
        });

        it('should use translation function if provided', () => {
            const mockT = vi.fn().mockReturnValue('Odesláno ke schválení');
            const message = getApprovalBannerMessage(456, mockT);
            expect(mockT).toHaveBeenCalledWith('approval.submitted_for_approval');
            expect(message).toContain('456');
            expect(message).toContain('Odesláno ke schválení');
        });
    });
});

describe('isApprovalCreatedResponse', () => {
    it('should return true for valid approval response', () => {
        expect(
            isApprovalCreatedResponse({
                status: 'approval_required',
                approval_id: 1,
                message: 'Test',
                action_type: 'edit',
                pending_fields: [],
            })
        ).toBe(true);
    });

    it('should return false for non-approval responses', () => {
        expect(isApprovalCreatedResponse(null)).toBe(false);
        expect(isApprovalCreatedResponse(undefined)).toBe(false);
        expect(isApprovalCreatedResponse({})).toBe(false);
        expect(isApprovalCreatedResponse({ approval_id: 1 })).toBe(false);
        expect(isApprovalCreatedResponse({ id: 1 })).toBe(false);
        expect(isApprovalCreatedResponse('string')).toBe(false);
        expect(isApprovalCreatedResponse(123)).toBe(false);
    });
});

describe('Form 202 Handling Contracts', () => {
    /**
     * These tests document the expected behavior contracts for forms.
     * The actual rendering tests would require more complex setup with
     * MemoryRouter, mocked APIs, and React Testing Library.
     * 
     * These contract tests verify the detection logic works correctly.
     */

    describe('RiskForm update behavior contract', () => {
        it('should detect approval response from riskApi.updateRisk', () => {
            // Simulated response from riskApi.updateRisk
            const mockApprovalResponse = {
                status: 'approval_required' as const,
                approval_id: 101,
                message: 'Risk edit submitted for approval',
                action_type: 'edit' as const,
                pending_fields: ['owner_id', 'department_id'],
            };

            const result = parseUpdateResult(mockApprovalResponse);
            expect(result.kind).toBe('approval');
            if (result.kind === 'approval') {
                expect(result.approvalId).toBe(101);
            }
        });

        it('should detect immediate success from riskApi.updateRisk', () => {
            // Simulated response from riskApi.updateRisk (immediate success)
            const mockSuccessResponse = {
                id: 1,
                name: 'Updated Risk',
                status: 'active',
            };

            const result = parseUpdateResult(mockSuccessResponse);
            expect(result.kind).toBe('applied');
        });
    });

    describe('ControlForm update behavior contract', () => {
        it('should detect approval response from controlApi.updateControl', () => {
            const mockApprovalResponse = {
                status: 'approval_required' as const,
                approval_id: 202,
                message: 'Control edit submitted for approval',
                action_type: 'edit' as const,
                pending_fields: [],
            };

            const result = parseUpdateResult(mockApprovalResponse);
            expect(result.kind).toBe('approval');
            if (result.kind === 'approval') {
                expect(result.approvalId).toBe(202);
            }
        });
    });

    describe('KRIForm update behavior contract', () => {
        it('should detect approval response from kriApi.updateKRI', () => {
            const mockApprovalResponse = {
                status: 'approval_required' as const,
                approval_id: 303,
                message: 'KRI edit submitted for approval',
                action_type: 'edit' as const,
                pending_fields: [],
            };

            const result = parseUpdateResult(mockApprovalResponse);
            expect(result.kind).toBe('approval');
            if (result.kind === 'approval') {
                expect(result.approvalId).toBe(303);
            }
        });
    });
});

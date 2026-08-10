import { type FormEvent, useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";

import { parseUpdateResult } from "@/lib/approvalUi";
import { navigateToApprovalRequest } from "@/pages/approvals/approvalNavigation";
import { ApiClientError } from "@/services/apiClient";
import { kriApi } from "@/services/kriApi";
import { logError } from "@/services/logger";
import { vendorLinkApi } from "@/services/vendorLinkApi";
import type { KRICreate } from "@/types/kri";
import { isProcessApprovalQueuedResponse } from "@/types/process";

import type { KRIFormVendorContext } from "./kriForm.types";
import type { KriFormStatePatch } from "./useKriFormState";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface UseKriSubmitArgs {
  effectiveVendorIds: number[];
  formData: Partial<KRICreate>;
  isEdit: boolean;
  isSelectedRiskLinkedToVendor: boolean;
  kriId?: number;
  navigate: NavigateFunction;
  onSuccess?: (kriId: number) => void | Promise<void>;
  setStatePatch: (patch: KriFormStatePatch) => void;
  t: TranslateFn;
  validateStep1: () => boolean;
  validateStep2: () => boolean;
  vendorContext: KRIFormVendorContext | null;
}

interface KriCreateOptions {
  linkRiskFirst?: boolean;
  requestReason?: string;
}

async function submitProtectedParentRiskLink(
  navigate: NavigateFunction,
  vendorContext: KRIFormVendorContext | null,
  riskId: number | null | undefined,
  options: KriCreateOptions,
): Promise<boolean> {
  if (
    !vendorContext?.protectedChangeRequiresApproval ||
    !options.linkRiskFirst ||
    !riskId
  ) {
    return false;
  }

  const result = await vendorLinkApi.linkRisk(
    vendorContext.vendorId,
    riskId,
    options.requestReason,
  );
  if (isProcessApprovalQueuedResponse(result)) {
    navigateToApprovalRequest(navigate, result.approval_id);
    return true;
  }
  return false;
}

export function useKriSubmit({
  effectiveVendorIds,
  formData,
  isEdit,
  isSelectedRiskLinkedToVendor,
  kriId,
  navigate,
  onSuccess,
  setStatePatch,
  t,
  validateStep1,
  validateStep2,
  vendorContext,
}: UseKriSubmitArgs) {
  const isProtectedVendorContext = Boolean(
    vendorContext?.protectedChangeRequiresApproval,
  );

  const finalizeCreate = useCallback(
    async (options: KriCreateOptions = {}) => {
      if (!validateStep1() || !validateStep2()) {
        return;
      }

      // A protected Vendor must not be linked through the direct create
      // payload — the relationship goes through the governed
      // vendor.link.kri.add route after the KRI exists (#100).
      try {
        setStatePatch({ approvalQueued: null, error: null, isSubmitting: true });
        const parentRiskLinkQueued = await submitProtectedParentRiskLink(
          navigate,
          vendorContext,
          formData.risk_id,
          options,
        );
        if (parentRiskLinkQueued) {
          return;
        }
        const newKRI = await kriApi.createKRI({
          ...(formData as KRICreate),
          linked_vendor_ids:
            vendorContext && isProtectedVendorContext
              ? effectiveVendorIds.filter(
                  (vendorId) => vendorId !== vendorContext.vendorId,
                )
              : effectiveVendorIds,
          ensure_parent_risk_vendor_ids:
            vendorContext && options.linkRiskFirst && !isProtectedVendorContext
              ? [vendorContext.vendorId]
              : undefined,
        });

        if (vendorContext) {
          let linkedDirectly = true;
          if (isProtectedVendorContext) {
            try {
              const result = await vendorLinkApi.linkKRI(
                vendorContext.vendorId,
                newKRI.id,
                options.requestReason,
              );
              if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
              }
            } catch (error) {
              logError("KRI created but failed to link vendor context.", error);
              linkedDirectly = false;
            }
          }
          void navigate(vendorContext.returnTo, {
            state: {
              vendorFlash: {
                tone: linkedDirectly ? "success" : "warn",
                message: linkedDirectly
                  ? t("vendors:links.kris.created_and_linked")
                  : t("vendors:links.kris.created_but_not_linked"),
                ctaHref: `/kris/${newKRI.id}`,
                ctaLabel: t("vendors:links.actions.open_kri"),
              },
            },
          });
          return;
        }

        if (onSuccess) {
          await onSuccess(newKRI.id);
          return;
        }

        void navigate(`/kris/${newKRI.id}`);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setStatePatch({ error: error.rawMessage ?? error.messageKey });
        } else {
          setStatePatch({ error: "errorKeys.save_kri_failed" });
        }
      } finally {
        setStatePatch({
          isMismatchDialogOpen: false,
          isSubmitting: false,
          pendingGovernedCreate: null,
        });
      }
    },
    [
      effectiveVendorIds,
      formData,
      isProtectedVendorContext,
      navigate,
      onSuccess,
      setStatePatch,
      t,
      validateStep1,
      validateStep2,
      vendorContext,
    ],
  );

  const beginCreate = useCallback(
    async (options: KriCreateOptions = {}) => {
      if (isProtectedVendorContext) {
        setStatePatch({
          isMismatchDialogOpen: false,
          pendingGovernedCreate: options,
        });
        return;
      }
      await finalizeCreate(options);
    },
    [finalizeCreate, isProtectedVendorContext, setStatePatch],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!validateStep1() || !validateStep2()) {
        return;
      }

      if (!isEdit) {
        if (
          vendorContext &&
          formData.risk_id &&
          !isSelectedRiskLinkedToVendor
        ) {
          setStatePatch({ isMismatchDialogOpen: true });
          return;
        }
        await beginCreate();
        return;
      }

      try {
        setStatePatch({ approvalQueued: null, error: null, isSubmitting: true });

        if (kriId) {
          const { current_value: _currentValue, ...updatePayload } = formData;
          const result = await kriApi.updateKRI(kriId, {
            ...updatePayload,
            linked_vendor_ids: effectiveVendorIds,
          });
          const parsed = parseUpdateResult(result);
          if (parsed.kind === "approval") {
            setStatePatch({
              approvalQueued: {
                message: parsed.message,
              },
              isSubmitting: false,
            });
            return;
          }
        }

        if (kriId) {
          void navigate(`/kris/${kriId}`);
        }
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setStatePatch({ error: error.rawMessage ?? error.messageKey });
        } else {
          setStatePatch({ error: "errorKeys.save_kri_failed" });
        }
      } finally {
        setStatePatch({ isSubmitting: false });
      }
    },
    [
      effectiveVendorIds,
      beginCreate,
      formData,
      isEdit,
      isSelectedRiskLinkedToVendor,
      kriId,
      navigate,
      setStatePatch,
      validateStep1,
      validateStep2,
      vendorContext,
    ],
  );

  return {
    beginCreate,
    finalizeCreate,
    handleSubmit,
  };
}

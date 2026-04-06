import { type FormEvent, useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";

import { parseUpdateResult } from "@/lib/approvalUi";
import { ApiClientError } from "@/services/apiClient";
import { kriApi } from "@/services/kriApi";
import type { KRICreate } from "@/types/kri";

import type { KRIFormVendorContext } from "./kriForm.types";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface UseKriSubmitArgs {
  effectiveVendorIds: number[];
  formData: Partial<KRICreate>;
  isEdit: boolean;
  isSelectedRiskLinkedToVendor: boolean;
  kriId?: number;
  navigate: NavigateFunction;
  onSuccess?: (kriId: number) => void | Promise<void>;
  setApprovalQueued: (approvalQueued: { message: string } | null) => void;
  setError: (error: string | null) => void;
  setIsMismatchDialogOpen: (isOpen: boolean) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  t: TranslateFn;
  validateStep1: () => boolean;
  validateStep2: () => boolean;
  vendorContext: KRIFormVendorContext | null;
}

export function useKriSubmit({
  effectiveVendorIds,
  formData,
  isEdit,
  isSelectedRiskLinkedToVendor,
  kriId,
  navigate,
  onSuccess,
  setApprovalQueued,
  setError,
  setIsMismatchDialogOpen,
  setIsSubmitting,
  t,
  validateStep1,
  validateStep2,
  vendorContext,
}: UseKriSubmitArgs) {
  const finalizeCreate = useCallback(
    async (options?: { linkRiskFirst?: boolean }) => {
      if (!validateStep1() || !validateStep2()) {
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        setApprovalQueued(null);
        const newKRI = await kriApi.createKRI({
          ...(formData as KRICreate),
          linked_vendor_ids: effectiveVendorIds,
          ensure_parent_risk_vendor_ids:
            vendorContext && options?.linkRiskFirst
              ? [vendorContext.vendorId]
              : undefined,
        });

        if (vendorContext) {
          void navigate(vendorContext.returnTo, {
            state: {
              vendorFlash: {
                tone: "success",
                message: t("vendors:links.kris.created_and_linked"),
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
          setError(error.rawMessage ?? error.messageKey);
        } else {
          setError("errorKeys.save_kri_failed");
        }
      } finally {
        setIsSubmitting(false);
        setIsMismatchDialogOpen(false);
      }
    },
    [
      effectiveVendorIds,
      formData,
      navigate,
      onSuccess,
      setApprovalQueued,
      setError,
      setIsMismatchDialogOpen,
      setIsSubmitting,
      t,
      validateStep1,
      validateStep2,
      vendorContext,
    ],
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
          setIsMismatchDialogOpen(true);
          return;
        }
        await finalizeCreate();
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        setApprovalQueued(null);

        if (kriId) {
          const { current_value: _currentValue, ...updatePayload } = formData;
          const result = await kriApi.updateKRI(kriId, {
            ...updatePayload,
            linked_vendor_ids: effectiveVendorIds,
          });
          const parsed = parseUpdateResult(result);
          if (parsed.kind === "approval") {
            setApprovalQueued({
              message: parsed.message,
            });
            setIsSubmitting(false);
            return;
          }
        }

        if (kriId) {
          void navigate(`/kris/${kriId}`);
        }
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setError(error.rawMessage ?? error.messageKey);
        } else {
          setError("errorKeys.save_kri_failed");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      effectiveVendorIds,
      finalizeCreate,
      formData,
      isEdit,
      isSelectedRiskLinkedToVendor,
      kriId,
      navigate,
      setApprovalQueued,
      setError,
      setIsMismatchDialogOpen,
      setIsSubmitting,
      validateStep1,
      validateStep2,
      vendorContext,
    ],
  );

  return {
    finalizeCreate,
    handleSubmit,
  };
}

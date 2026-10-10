import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';

import { resolveRiskTypeDisplayName } from './riskRegisterConfig';

/**
 * Risk-type code -> the display name the Risk register shows: the translated
 * label of a built-in type (`risks:categories.*`), else the configured Risk Hub
 * display name, else `fallback`, else the code. For registers and cards outside
 * the Risk register that receive only the stored code (Control and KRI groups).
 */
export function useRiskTypeLabel(): (code: string, fallback?: string) => string {
    const { t } = useTranslation('risks');
    const { riskTypes } = useRiskTypes();
    return (code, fallback) => resolveRiskTypeDisplayName(
        code,
        riskTypes.find((type) => type.code === code)?.display_name || fallback,
        (key, defaultValue) => t(key, defaultValue),
    );
}

import { useTranslation } from '@/i18n/hooks';

import { LoadingState } from '@/components/ui/state';

export function VendorDetailLoadingState() {
    const { t } = useTranslation('vendors');

    return <LoadingState layout="page" label={t('labels.loading')} />;
}

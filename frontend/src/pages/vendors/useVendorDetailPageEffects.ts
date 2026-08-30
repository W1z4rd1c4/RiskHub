import { useEffect, useState } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';

import {
    getVendorDetailScrollTargetId,
    normalizeVendorDetailSearch,
    type VendorDetailFlash,
} from './vendorDetailPresentation';

interface VendorLocationState {
    vendorFlash?: VendorDetailFlash;
}

function getVendorFlash(locationState: unknown): VendorDetailFlash | null {
    return (locationState as VendorLocationState | null)?.vendorFlash ?? null;
}

export function useVendorFlashMessage(location: Location, navigate: NavigateFunction) {
    const [actionMessage, setActionMessage] = useState<VendorDetailFlash | null>(() => getVendorFlash(location.state));
    const currentLocation = `${location.pathname}${location.search}${location.hash}`;

    useEffect(() => {
        if (getVendorFlash(location.state)) {
            void navigate(currentLocation, { replace: true });
        }
    }, [currentLocation, location.state, navigate]);

    const dismissActionMessage = () => {
        setActionMessage(null);
        void navigate(currentLocation, { replace: true });
    };

    return {
        actionMessage,
        setActionMessage,
        dismissActionMessage,
    };
}

export function useVendorDeepLinkScroll(location: Location) {
    useEffect(() => {
        if (!location.search) {
            return;
        }

        const params = new URLSearchParams(location.search);
        const targetId = getVendorDetailScrollTargetId(params.get('tab'), params.get('section'));
        if (!targetId) {
            return;
        }

        const frameId = window.requestAnimationFrame(() => {
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [location.pathname, location.search]);
}

export function useNormalizeLegacyVendorDetailSearch(location: Location, navigate: NavigateFunction) {
    useEffect(() => {
        const search = normalizeVendorDetailSearch(location.search);
        if (search === null) return;

        void navigate({
            pathname: location.pathname,
            search,
            hash: location.hash,
        }, { replace: true });
    }, [location.hash, location.pathname, location.search, navigate]);
}

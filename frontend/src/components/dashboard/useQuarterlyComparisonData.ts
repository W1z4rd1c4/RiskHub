import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '@/i18n/hooks';
import { dashboardApi } from '@/services/dashboardApi';
import { logError } from '@/services/logger';

import {
    getCurrentQuarterSelection,
    getPreviousQuarter,
    isAfterQuarter,
    isCompareQuarterInvalid,
    parseQuarterLabel,
    toQuarterLabel,
    type QuarterlyData,
} from './quarterlyComparisonPresentation';

export function useQuarterlyComparisonData() {
    const { t } = useTranslation('dashboard');
    const [data, setData] = useState<QuarterlyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [actualCurrentYear, setActualCurrentYear] = useState<number | null>(null);
    const [actualCurrentQuarter, setActualCurrentQuarter] = useState<number | null>(null);
    const [currentYear, setCurrentYear] = useState<number | null>(null);
    const [currentQuarter, setCurrentQuarter] = useState<number | null>(null);
    const [compareYear, setCompareYear] = useState<number | null>(null);
    const [compareQuarter, setCompareQuarter] = useState<number | null>(null);

    const currentQuarterLabel = currentYear && currentQuarter
        ? toQuarterLabel(currentYear, currentQuarter)
        : undefined;
    const compareQuarterLabel = compareYear && compareQuarter
        ? toQuarterLabel(compareYear, compareQuarter)
        : undefined;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await dashboardApi.fetchQuarterlyComparison(currentQuarterLabel, compareQuarterLabel);
            setData(result);
        } catch (err) {
            logError('Failed to fetch quarterly comparison:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [compareQuarterLabel, currentQuarterLabel, t]);

    useEffect(() => {
        async function init() {
            try {
                const periods = await dashboardApi.fetchAvailablePeriods();
                setAvailableYears(periods.years);
                const { year, quarter } = parseQuarterLabel(periods.current_quarter);
                setActualCurrentYear(year);
                setActualCurrentQuarter(quarter);
                setCurrentYear(year);
                setCurrentQuarter(quarter);
                const previous = getPreviousQuarter(year, quarter);
                setCompareYear(previous.year);
                setCompareQuarter(previous.quarter);
            } catch (err) {
                logError('Failed to fetch available periods:', err);
                const { year, quarter } = getCurrentQuarterSelection();
                const previous = getPreviousQuarter(year, quarter);
                setAvailableYears(Array.from(new Set([previous.year, year])).sort((a, b) => a - b));
                setActualCurrentYear(year);
                setActualCurrentQuarter(quarter);
                setCurrentYear(year);
                setCurrentQuarter(quarter);
                setCompareYear(previous.year);
                setCompareQuarter(previous.quarter);
            }
        }
        void init();
    }, []);

    useEffect(() => {
        if (!actualCurrentYear || !actualCurrentQuarter || !currentYear || !currentQuarter) {
            return;
        }
        if (isAfterQuarter(currentYear, currentQuarter, actualCurrentYear, actualCurrentQuarter)) {
            setCurrentYear(actualCurrentYear);
            setCurrentQuarter(actualCurrentQuarter);
        }
    }, [actualCurrentQuarter, actualCurrentYear, currentQuarter, currentYear]);

    useEffect(() => {
        if (!currentYear || !currentQuarter || !compareYear || !compareQuarter) {
            return;
        }
        if (isCompareQuarterInvalid(compareYear, compareQuarter, currentYear, currentQuarter)) {
            const previous = getPreviousQuarter(currentYear, currentQuarter);
            setCompareYear(previous.year);
            setCompareQuarter(previous.quarter);
        }
    }, [compareQuarter, compareYear, currentQuarter, currentYear]);

    useEffect(() => {
        if (!currentYear || !currentQuarter || !compareYear || !compareQuarter) {
            return;
        }
        if (
            actualCurrentYear
            && actualCurrentQuarter
            && isAfterQuarter(currentYear, currentQuarter, actualCurrentYear, actualCurrentQuarter)
        ) {
            return;
        }
        if (isCompareQuarterInvalid(compareYear, compareQuarter, currentYear, currentQuarter)) {
            return;
        }
        void fetchData();
    }, [
        actualCurrentQuarter,
        actualCurrentYear,
        compareQuarter,
        compareYear,
        currentQuarter,
        currentYear,
        fetchData,
    ]);

    return {
        actualCurrentQuarter,
        actualCurrentYear,
        availableYears,
        compareQuarter,
        compareYear,
        currentQuarter,
        currentYear,
        data,
        error,
        isLoading,
        setCompareQuarter,
        setCompareYear,
        setCurrentQuarter,
        setCurrentYear,
    };
}

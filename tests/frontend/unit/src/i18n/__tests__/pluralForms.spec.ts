import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';

// The unit-test i18n singleton bundles every locale, so a fixed translator per language
// exercises the real en/cs resources without changing the global language.
const cs = i18n.getFixedT('cs');
const en = i18n.getFixedT('en');

describe('locale plural families (GAP-B-14)', () => {
  it('selects Czech one/few/many/other forms by grammatical number', () => {
    expect(cs('controls:audit_trail.total_records', { count: 1 })).toBe('Celkem 1 záznam');
    expect(cs('controls:audit_trail.total_records', { count: 3 })).toBe('Celkem 3 záznamy');
    expect(cs('controls:audit_trail.total_records', { count: 5 })).toBe('Celkem 5 záznamů');
    expect(cs('controls:audit_trail.total_records', { count: 1.5 })).toBe('Celkem 1.5 záznamu');
    expect(cs('risks:register.filters.active_count', { count: 2 })).toBe('2 aktivní filtry');
    expect(cs('risks:register.filters.active_count', { count: 11 })).toBe('11 aktivních filtrů');
    expect(cs('common:department_detail.health.critical_vendors', { count: 2 })).toBe('2 kritičtí');
  });

  it('selects English one/other forms', () => {
    expect(en('controls:audit_trail.total_records', { count: 1 })).toBe('1 Total Record');
    expect(en('controls:audit_trail.total_records', { count: 0 })).toBe('0 Total Records');
    expect(en('common:department_detail.health.kri_breaches', { count: 1 })).toBe('1 breach');
    expect(en('risks:register.filters.active_count', { count: 3 })).toBe('3 active filters');
  });

  it('agrees the noun with the total when a shown/total pair is rendered', () => {
    expect(en('admin:access.of_users', { shown: 1, count: 1 })).toBe('1 of 1 user');
    expect(en('admin:access.of_users', { shown: 2, count: 8 })).toBe('2 of 8 users');
    expect(cs('admin:access.of_users', { shown: 1, count: 1 })).toBe('1 z 1 uživatele');
    expect(cs('ictRegisterDq:rows_scoped', { shown: 5, count: 7 })).toContain('z 7 řádků');
  });
});

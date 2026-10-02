import { describe, expect, it } from 'vitest';

import {
    ENTITY_ICON_BY_TYPE,
    ENTITY_ICON_FALLBACK,
    ENTITY_ICONS,
} from '@/constants/entityIcons';
import { protectedAppRoutes } from '@/routing';

/**
 * NAV-03: one entity-to-icon map. A glyph names exactly one entity, and the sidebar routes
 * take the entity icons from the map instead of re-picking their own.
 */
describe('ENTITY_ICONS', () => {
    it('gives every entity its own icon', () => {
        const icons = Object.values(ENTITY_ICONS);
        expect(new Set(icons).size).toBe(icons.length);
    });

    it('exposes the same icons by backend entity type, with a distinct fallback', () => {
        expect(ENTITY_ICON_BY_TYPE.risk).toBe(ENTITY_ICONS.risk);
        expect(ENTITY_ICON_BY_TYPE.vendor).toBe(ENTITY_ICONS.vendor);
        expect(ENTITY_ICON_BY_TYPE.not_an_entity).toBeUndefined();
        expect(Object.values(ENTITY_ICONS)).not.toContain(ENTITY_ICON_FALLBACK);
    });
});

describe('sidebar route icons (NAV-03)', () => {
    const navRoutes = protectedAppRoutes.filter((route) => route.nav);

    it('never shares one icon between two destinations', () => {
        const byIcon = new Map<unknown, string[]>();
        for (const route of navRoutes) {
            const hrefs = byIcon.get(route.nav!.icon) ?? [];
            hrefs.push(route.nav!.href);
            byIcon.set(route.nav!.icon, hrefs);
        }
        const shared = [...byIcon.values()].filter((hrefs) => hrefs.length > 1);
        expect(shared).toEqual([]);
    });

    it.each([
        ['/risks', ENTITY_ICONS.risk],
        ['/controls', ENTITY_ICONS.control],
        ['/kris', ENTITY_ICONS.kri],
        ['/issues', ENTITY_ICONS.issue],
        ['/threats', ENTITY_ICONS.threat],
        ['/processes', ENTITY_ICONS.process],
        ['/assets', ENTITY_ICONS.asset],
        ['/vendors', ENTITY_ICONS.vendor],
        ['/departments', ENTITY_ICONS.department],
    ])('uses the entity icon for %s', (href, icon) => {
        expect(navRoutes.find((route) => route.nav!.href === href)?.nav?.icon).toBe(icon);
    });
});

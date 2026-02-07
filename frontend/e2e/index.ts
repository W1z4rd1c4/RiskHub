/**
 * E2E Test Suite - Barrel Exports
 *
 * Central export point for all fixtures, helpers, and Page Object Models.
 * Import from 'e2e' or 'e2e/index' to access shared E2E utilities.
 */

// Fixtures
export { test, expect } from './fixtures/auth.fixture';
export * from './fixtures/e2e-data';

// Helpers
export * from './helpers/login';
export * from './helpers/wait';

// Page Object Models
export { ActivityLogPage } from './pages/ActivityLogPage';
export { ApprovalsPage } from './pages/ApprovalsPage';
export { ControlsPage } from './pages/ControlsPage';
export { DashboardPage } from './pages/DashboardPage';
export { KRIsPage } from './pages/KRIsPage';
export { LoginPage } from './pages/LoginPage';
export { RisksPage } from './pages/RisksPage';
export { VendorDetailPage } from './pages/VendorDetailPage';
export { VendorsPage } from './pages/VendorsPage';

# tests/frontend/unit/src/pages/vendors/__tests__

Vendors page unit tests: vendor contracts section behavior — archived-contract
demotion (`VendorContractsSection.archived-demote.test.tsx`), error contract
(`VendorContractsSection.error-contract.test.tsx`), and form accessibility
(`VendorContractsSection.form-a11y.test.tsx`) — plus the sub-outsourcing chain
table (`VendorSubOutsourcingChainTable.test.tsx`) and the governed
protected-Vendor sub-outsourcing create/edit/archive matrix with the
direct-restore regression (`VendorSubOutsourcingSection.governed.test.tsx`,
ticket #101).

`VendorContractsSection.archive-confirm.test.tsx` pins GAP-C-06: every contract
archive is confirmed (archive intent, optional reason without approval,
required reason with approval) and an approval-routed archive keeps the user on
the vendor with the pending notice (D12 / PM-2).

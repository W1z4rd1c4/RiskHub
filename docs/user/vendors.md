# Managing Vendors

> **Who uses this**: Risk Managers, Outsourcing Owners, Department Heads, Compliance

---

## Viewing Vendors

1. Open **Vendors** from the sidebar.
2. The list contains vendors you can access based on role and department scope.

### Filtering Vendors

- **Search**: vendor name/process
- **Status**: Active or Inactive
- **Type**: ICT, Outsourcing, Professional Services, Partner, Other

By default, inactive vendors are hidden. Set **Status = Inactive** to view archived/inactive vendors.

---

## Exporting Vendors

Use the **Export** button in the Vendors header.

### Export Workflow

1. Open **Vendors**
2. Click **Export**
3. Select:
   - **Format**: Excel (`.xlsx`) or CSV (`.csv`)
   - **As of date**: defaults to today
4. Click **Export**

### Export Scope and Data

- Export follows current list filters (status, search, vendor type).
- Data is permission-scoped; only accessible vendors are included.
- Inactive vendors are exported only when **Status = Inactive**.

---

## Archiving and Restoring Vendors

- Vendor archive semantics use `status = inactive`.
- Users with `vendors:delete` can restore vendors to `status = active`.
- Restore actions are available in vendor detail and list rows (when inactive is visible).

---

## Next Steps

- [Managing Risks](./risks.md)
- [Managing Controls](./controls.md)
- [Key Risk Indicators](./kris.md)
- [Dashboard & Reports](./dashboard.md)

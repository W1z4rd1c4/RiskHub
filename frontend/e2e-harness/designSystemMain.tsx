/*
 * Design-system harness (audit 2026-09-30 §5.3 exit criterion): every shared primitive in a
 * static grid, one `data-ds-section` per family, so G-RENDER
 * (tests/frontend/e2e/theme-rendered-contrast.spec.ts) measures each family in all three
 * themes. `?theme=light|riskhub|dark&locale=en|cs`; `?dialog=<id>` opens one modal surface
 * (`shell`, or `confirm-<intent>`) over the grid; `?view=auth-frame` renders the public
 * `AuthFrame` instead in a signed-out context without a stored app theme (it follows the
 * emulated OS colour scheme, D14), `?view=auth-frame-app-theme` with the stored theme kept
 * (it inherits the `<html>` theme, as on `/auth/local/security`). No API, providers or
 * routes are needed: the theme class is set on <html> as ThemeContext does.
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Archive, FileText, Pencil, Shield, Trash2 } from 'lucide-react';

import '@/index.css';
import i18n, { normalizeSupportedLanguage } from '@/i18n';

import { ConfirmDialog, type ConfirmIntent } from '@/components/ConfirmDialog';
import { AuthFrame } from '@/components/layout/AuthFrame';
import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/tables/Pagination';
import { RowActionButton } from '@/components/tables/RowActionButton';
import { SortableTable, type Column, type SortDirection } from '@/components/tables/SortableTable';
import { BackButton } from '@/components/ui/BackButton';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage, type InlineMessageTone } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup } from '@/components/ui/radio-group';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState, Skeleton, Spinner } from '@/components/ui/state';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR, TableRowButton } from '@/components/ui/table';
import { TabList, TabPanel, type TabsVariant } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
  Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, type ToastTone,
} from '@/components/ui/toast';
import { SEVERITY_BANDS } from '@/lib/severity';
import { TONES } from '@/lib/tones';
import { THEME_KEY } from '@/utils/userSettingsStorage';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') ?? 'riskhub';
const locale = normalizeSupportedLanguage(params.get('locale'));
const dialog = params.get('dialog');
const view = params.get('view');
document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-riskhub');
document.documentElement.classList.add(`theme-${theme}`);
document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
document.documentElement.lang = locale;
// The public, signed-out context has no stored app theme, so AuthFrame follows the OS scheme.
if (view === 'auth-frame') localStorage.removeItem(THEME_KEY);
await i18n.changeLanguage(locale);

const noop = () => undefined;
const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'accent', 'secondary', 'outline', 'ghost', 'destructive', 'warning', 'success', 'link',
];
const MESSAGE_TONES: readonly InlineMessageTone[] = ['info', 'success', 'warning', 'danger', 'neutral'];
const TOAST_TONES: readonly ToastTone[] = ['success', 'info', 'warning', 'danger'];
const CONFIRM_INTENTS: readonly ConfirmIntent[] = ['archive', 'delete', 'unlink', 'send', 'discard', 'revoke', 'generic'];
const OPTIONS = [
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'it', label: 'Information technology' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`ds-${id}`} data-ds-section={id} className="glass rounded-2xl p-6 space-y-5">
      <h2 id={`ds-${id}`} className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-eyebrow">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Buttons() {
  return (
    <Section id="buttons" title="Buttons">
      <Row label="Variants">
        {BUTTON_VARIANTS.map((variant) => <Button key={variant} variant={variant}>{variant}</Button>)}
      </Row>
      <Row label="Sizes and states">
        <Button variant="accent" size="lg">Large</Button>
        <Button variant="accent">Default</Button>
        <Button variant="accent" size="compact">Compact</Button>
        <Button variant="outline" size="icon" aria-label="Edit"><Pencil aria-hidden="true" /></Button>
        <Button variant="ghost" size="iconCompact" aria-label="Archive"><Archive aria-hidden="true" /></Button>
        <Button variant="accent" isLoading>Saving</Button>
        <Button variant="secondary" disabled>Disabled</Button>
      </Row>
      <Row label="Derived buttons">
        <BackButton to="/risks" label="Back to Risks" />
        <BackButton onClick={noop} label="Back to Operations Risk" variant="ghost" size="compact" />
        <RefreshButton onRefresh={noop} />
        <RefreshButton onRefresh={noop} isFetching variant="outline" size="compact" />
        <RefreshButton onRefresh={noop} iconOnly />
        <RowActionButton icon={Pencil} label="Edit Operations Risk" onClick={noop} />
        <RowActionButton icon={Trash2} label="Delete Operations Risk" tone="danger" onClick={noop} />
        <RowActionButton icon={Archive} label="Archive Operations Risk" onClick={noop} disabledReason="Already archived" />
      </Row>
    </Section>
  );
}

function Forms() {
  const [owner, setOwner] = useState('operations');
  const [departments, setDepartments] = useState<string[]>(['operations', 'finance']);
  const [notify, setNotify] = useState(true);
  const [priority, setPriority] = useState(false);
  const [channel, setChannel] = useState('email');
  const [layout, setLayout] = useState('compact');
  return (
    <Section id="forms" title="Form controls">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Risk name" required help="Shown in registers and reports.">
          {(field) => <Input {...field} defaultValue="Operations Risk" />}
        </Field>
        <Field label="Risk code" required error="Enter a unique code.">
          {(field) => <Input {...field} defaultValue="OPS" />}
        </Field>
        <Field label="Search" optional>
          {(field) => <Input {...field} size="compact" defaultValue="vendor" />}
        </Field>
        <Field label="Disabled input">
          {(field) => <Input {...field} disabled defaultValue="Read-only value" />}
        </Field>
        <Field label="Description" help="Plain text, up to 2000 characters.">
          {(field) => <Textarea {...field} defaultValue="Process outage in the payments platform." />}
        </Field>
        <Field label="Mitigation" required error="Describe the mitigation.">
          {(field) => <Textarea {...field} defaultValue="Manual fallback" />}
        </Field>
        <Field label="Owner department">
          {(field) => <ThemedSelect {...field} value={owner} onValueChange={setOwner} options={OPTIONS} />}
        </Field>
        <Field label="Departments" error="Select at least one department.">
          {(field) => <MultiSelect {...field} options={OPTIONS} value={departments} onChange={setDepartments} showChips />}
        </Field>
        <Field label="Frequency">
          {(field) => (
            <NativeSelect {...field} defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Notification channel" group>
          {(field) => (
            <RadioGroup
              {...field}
              value={channel}
              onValueChange={setChannel}
              options={[
                { value: 'email', label: 'Email', description: 'Sent to the owner' },
                { value: 'in_app', label: 'In-app' },
                { value: 'none', label: 'None', disabled: true },
              ]}
            />
          )}
        </Field>
      </div>
      <RadioGroup
        legend="Layout"
        variant="card"
        value={layout}
        onValueChange={setLayout}
        options={[
          { value: 'compact', label: 'Compact', description: 'Dense rows for registers' },
          { value: 'comfortable', label: 'Comfortable', description: 'Roomy rows for review' },
        ]}
      />
      <div className="flex flex-wrap gap-6">
        <Field label="Notify owner" layout="inline">
          {(field) => <Checkbox {...field} checked={notify} onCheckedChange={setNotify} />}
        </Field>
        <Field label="Select all" layout="inline">
          {(field) => <Checkbox {...field} indeterminate onCheckedChange={noop} />}
        </Field>
        <Field label="Priority risk" layout="inline">
          {(field) => <Switch {...field} checked={priority} onCheckedChange={setPriority} />}
        </Field>
        <Field label="Archived" layout="inline">
          {(field) => <Switch {...field} checked onCheckedChange={noop} />}
        </Field>
      </div>
    </Section>
  );
}

function Badges() {
  return (
    <Section id="badges" title="Badges">
      {(['soft', 'solid', 'outline'] as const).map((variant) => (
        <Row key={variant} label={variant}>
          {TONES.map((tone) => <Badge key={tone} tone={tone} variant={variant}>{tone}</Badge>)}
        </Row>
      ))}
      <Row label="Sizes, dot, icon, rounded">
        <Badge tone="info" size="sm">Small</Badge>
        <Badge tone="success" dot>Active</Badge>
        <Badge tone="warning" icon={Shield}>Pending review</Badge>
        <Badge tone="neutral" shape="rounded">KRI</Badge>
        <Badge tone="danger" srLabel="Overdue">!</Badge>
      </Row>
      <Row label="Severity">
        {SEVERITY_BANDS.map((band) => <SeverityBadge key={band} band={band} />)}
        {SEVERITY_BANDS.map((band) => <SeverityBadge key={`${band}-sm`} band={band} size="sm" />)}
      </Row>
    </Section>
  );
}

function Surfaces() {
  return (
    <Section id="surfaces" title="Cards and messages">
      <div className="grid gap-5 md:grid-cols-2">
        <Card tone="nested">
          <CardHeader
            title="Linked controls"
            titleAs="h3"
            icon={FileText}
            eyebrow="Overview"
            description="Controls that mitigate this risk."
            actions={<Button size="compact" variant="outline">Link control</Button>}
          />
          <CardBody>
            <p className="text-sm text-foreground">Three controls are linked.</p>
            <p className="text-sm text-muted-foreground">Last reviewed on 12 September 2026.</p>
          </CardBody>
          <CardFooter>
            <Button variant="secondary" size="compact">Cancel</Button>
            <Button variant="accent" size="compact">Save</Button>
          </CardFooter>
        </Card>
        <div className="space-y-3">
          {MESSAGE_TONES.map((tone) => (
            <InlineMessage
              key={tone}
              tone={tone}
              live="off"
              title={`${tone} message`}
              onDismiss={tone === 'info' ? noop : undefined}
              action={tone === 'danger' ? <Button size="compact" variant="outline">Retry</Button> : undefined}
            >
              The change was recorded and is waiting for approval.
            </InlineMessage>
          ))}
        </div>
      </div>
    </Section>
  );
}

function TabsDemo({ variant }: { variant: TabsVariant }) {
  const [active, setActive] = useState<'overview' | 'history' | 'links'>('overview');
  const prefix = `ds-tabs-${variant}`;
  return (
    <div className="space-y-3">
      <TabList
        variant={variant}
        ariaLabel={`${variant} tabs`}
        idPrefix={prefix}
        activeTab={active}
        onChange={setActive}
        tabs={[
          { id: 'overview', label: 'Overview', icon: FileText },
          { id: 'history', label: 'History', count: 12 },
          { id: 'links', label: 'Links', disabled: true },
        ]}
      />
      {(['overview', 'history', 'links'] as const).map((tab) => (
        <TabPanel key={tab} tab={tab} activeTab={active} idPrefix={prefix}>
          <p className="text-sm text-muted-foreground">{`${variant} ${tab} panel`}</p>
        </TabPanel>
      ))}
    </div>
  );
}

interface RiskRow {
  id: number;
  name: string;
  owner: string;
  band: (typeof SEVERITY_BANDS)[number];
}

const ROWS: RiskRow[] = [
  { id: 1, name: 'Operations Risk', owner: 'Alice Novak', band: 'high' },
  { id: 2, name: 'Vendor concentration', owner: 'Petr Svoboda', band: 'medium' },
  { id: 3, name: 'Payment outage', owner: 'Jana Dvořák', band: 'critical' },
];

function Tables() {
  const [sort, setSort] = useState<{ key: string | null; direction: SortDirection }>({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(3);
  const columns: Column<RiskRow>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'owner', label: 'Owner', sortable: true },
    { key: 'band', label: 'Severity', render: (row) => <SeverityBadge band={row.band} /> },
  ];
  return (
    <Section id="tables" title="Tables and pagination">
      <Table regionLabel="Primitive table" density="compact">
        <THead>
          <TR>
            <TH onSort={noop} sortDirection="asc">Name</TH>
            <TH>Owner</TH>
            <TH align="right">Score</TH>
          </TR>
        </THead>
        <TBody>
          {ROWS.map((row) => (
            <TR key={row.id}>
              <TD><TableRowButton onClick={noop} srLabel={`Open ${row.name}`}>{row.name}</TableRowButton></TD>
              <TD>{row.owner}</TD>
              <TD align="right">{row.id * 7}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <SortableTable
        data={ROWS}
        columns={columns}
        keyExtractor={(row) => row.id}
        sortKey={sort.key}
        sortDirection={sort.direction}
        onSort={(key, direction) => setSort({ key, direction })}
        onRowActivate={noop}
        rowActivateLabel={(row) => `Open ${row.name}`}
        getRowActions={(row) => <RowActionButton icon={Pencil} label={`Edit ${row.name}`} onClick={noop} />}
        horizontalRegionLabel="Risk register"
      />
      <SortableTable data={[]} columns={columns} keyExtractor={(row) => row.id} emptyMessage="No risks match the filters." />
      <Pagination currentPage={page} totalPages={12} totalItems={236} itemsPerPage={20} onPageChange={setPage} />
      <Pagination mode="compact" currentPage={page} totalPages={12} itemsPerPage={20} onPageChange={setPage} />
      <Pagination mode="cursor" hasPrevious hasNext onPrevious={noop} onNext={noop} summary="Showing 20 notifications" />
    </Section>
  );
}

function Navigation() {
  const [language, setLanguage] = useState(locale);
  return (
    <Section id="navigation" title="Tabs and public frame">
      <TabsDemo variant="underline" />
      <TabsDemo variant="pill" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BrandWordmark className="font-heading text-lg font-bold tracking-tight" />
        <LanguageSwitch label="Language" showLabel value={language} onChange={setLanguage} />
      </div>
    </Section>
  );
}

function States() {
  return (
    <Section id="states" title="Loading, empty, error and access states">
      <div className="grid gap-5 md:grid-cols-2">
        <Card tone="nested" padding="none"><LoadingState label="Loading risks…" /></Card>
        <Card tone="nested" padding="none">
          <EmptyState title="No risks yet" description="Create the first risk to start the register." action={<Button variant="accent" size="compact">New risk</Button>} />
        </Card>
        <Card tone="nested" padding="none">
          <EmptyState kind="no-results" title="No risks match the filters" description="Clear the filters to see every risk." />
        </Card>
        <Card tone="nested" padding="none">
          <ErrorState title="Risks could not be loaded" message="Check your connection and try again." onRetry={noop} />
        </Card>
        <Card tone="nested" padding="none"><AccessDeniedState layout="section" headingLevel={3} /></Card>
        <div className="space-y-3">
          <ErrorState variant="banner" layout="inline" message="Showing data from 10:42; refresh failed." onRetry={noop} />
          <LoadingState layout="inline" label="Refreshing…" />
          <div className="flex items-center gap-3"><Spinner label="Saving" /><Skeleton className="h-4 w-40" /></div>
        </div>
      </div>
    </Section>
  );
}

function Feedback() {
  return (
    <Section id="feedback" title="Toasts">
      <ToastProvider label="Notifications">
        {TOAST_TONES.map((tone) => (
          <Toast key={tone} tone={tone} open duration={Number.POSITIVE_INFINITY} onOpenChange={noop}>
            <ToastTitle>{`${tone} toast`}</ToastTitle>
            <ToastDescription>The risk was saved and sent for approval.</ToastDescription>
            {tone === 'success' ? <ToastAction label="View approvals" onClick={noop} /> : null}
            <ToastClose label="Dismiss notification" />
          </Toast>
        ))}
        <ToastViewport className="static z-auto max-h-none p-0 sm:max-w-none" />
      </ToastProvider>
    </Section>
  );
}

function OpenDialog({ id }: { id: string }) {
  if (id === 'shell') {
    return (
      <DialogShell isOpen onClose={noop} titleId="ds-dialog-title" size="md">
        <DialogHeader title="Edit risk" description="Changes are routed for approval." icon={Pencil} />
        <DialogBody className="space-y-4">
          <Field label="Risk name" required>
            {(field) => <Input {...field} defaultValue="Operations Risk" />}
          </Field>
          <Field label="Reason" error="Enter a reason for the change.">
            {(field) => <Textarea {...field} defaultValue="" />}
          </Field>
          <InlineMessage tone="warning" live="off">This risk has a pending change.</InlineMessage>
        </DialogBody>
        <DialogFooter submitLabel="Save changes" onSubmit={noop} intent="accent" />
      </DialogShell>
    );
  }
  const intent = id.replace(/^confirm-/, '') as ConfirmIntent;
  if (!CONFIRM_INTENTS.includes(intent)) throw new Error(`Unknown design-system dialog ${id}`);
  return (
    <ConfirmDialog
      isOpen
      onClose={noop}
      onConfirm={noop}
      intent={intent}
      entityLabel="Risk"
      entityName="Operations Risk"
      reason={intent === 'archive' ? 'optional' : 'none'}
      errorText={intent === 'delete' ? 'The risk could not be deleted. Try again.' : null}
    />
  );
}

function AuthFrameView() {
  return (
    <AuthFrame title="Sign in to RiskHub" error="The email or password is not correct." status="Please wait…" busy>
      <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
        <Field label="Email" required>
          {(field) => <Input {...field} type="email" defaultValue="alice@example.test" />}
        </Field>
        <Field label="Password" required>
          {(field) => <Input {...field} type="password" defaultValue="correct-horse" />}
        </Field>
        <Button type="submit" variant="accent" className="w-full">Sign in</Button>
        <p className="text-sm text-muted-foreground">Forgot your password? Ask your administrator.</p>
      </form>
    </AuthFrame>
  );
}

function Harness() {
  if (view === 'auth-frame' || view === 'auth-frame-app-theme') return <AuthFrameView />;
  return (
    <main className="min-h-screen bg-background p-8 text-foreground" data-testid="design-system-ready">
      <PageContainer>
        <div data-ds-section="page-header">
          <PageHeader
            title="RiskHub design system"
            eyebrow="Harness"
            description="Every shared primitive, measured by G-RENDER in three themes."
            icon={Shield}
            back={{ label: 'Back to Risks', to: '/risks' }}
            breadcrumbs={[{ label: 'Risks', to: '/risks' }, { label: 'Operations Risk', to: '/risks/1' }, { label: 'Edit' }]}
            actions={<><RefreshButton onRefresh={noop} /><Button variant="accent">New risk</Button></>}
          />
        </div>
        <Buttons />
        <Forms />
        <Badges />
        <Surfaces />
        <Navigation />
        <Tables />
        <States />
        <Feedback />
      </PageContainer>
      {dialog ? <OpenDialog id={dialog} /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
);

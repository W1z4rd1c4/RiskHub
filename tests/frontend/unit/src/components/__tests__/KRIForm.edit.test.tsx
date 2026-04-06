import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KRIForm } from "@/components/KRIForm";

const mockNavigate = vi.fn();
const mockGetRisk = vi.fn();
const mockGetRisks = vi.fn();
const mockGetLinkedRisks = vi.fn();
const mockListVisibleUsers = vi.fn();
const mockGetVendors = vi.fn();
const mockUpdateKri = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/services/riskApi", () => ({
  riskApi: {
    getRisks: (...args: unknown[]) => mockGetRisks(...args),
    getRisk: (...args: unknown[]) => mockGetRisk(...args),
  },
}));

vi.mock("@/services/userApi", () => ({
  userApi: {
    listVisibleUsers: (...args: unknown[]) => mockListVisibleUsers(...args),
  },
}));

vi.mock("@/services/vendorApi", () => ({
  vendorApi: {
    getVendors: (...args: unknown[]) => mockGetVendors(...args),
  },
}));

vi.mock("@/services/vendorLinkApi", () => ({
  vendorLinkApi: {
    getLinkedRisks: (...args: unknown[]) => mockGetLinkedRisks(...args),
  },
}));

vi.mock("@/services/kriApi", () => ({
  kriApi: {
    createKRI: vi.fn(),
    updateKRI: (...args: unknown[]) => mockUpdateKri(...args),
  },
}));

const initialData = {
  risk_id: 101,
  metric_name: "Claims Leakage Ratio",
  description: "Monitors operational leakage trend.",
  current_value: 12.5,
  lower_limit: 0,
  upper_limit: 10,
  unit: "%",
  frequency: "quarterly" as const,
};

function renderEditForm() {
  render(
    <MemoryRouter>
      <KRIForm
        initialData={initialData}
        initialLinkedVendorIds={[12]}
        isEdit
        kriId={21}
      />
    </MemoryRouter>,
  );
}

async function advanceToDetailsAndSelectVendor() {
  await waitFor(() => {
    expect(mockGetRisk).toHaveBeenCalledWith(101);
  });

  fireEvent.click(screen.getByRole("button", { name: /Next|Další/i }));

  const vendorCheckbox = await screen.findByRole("checkbox", {
    name: /Vendor Twenty-One/i,
  });
  fireEvent.click(vendorCheckbox);
}

describe("KRIForm edit flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRisks.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });
    mockGetRisk.mockResolvedValue({
      id: 101,
      risk_id_code: "RISK-101",
      name: "Claims Ops Risk",
      process: "Claims",
      risk_type: "operational",
      category: "Operational",
      description: "Primary claims risk.",
      gross_score: 9,
      gross_probability: 3,
      gross_impact: 3,
      net_score: 4,
      status: "active",
      is_priority: false,
      department_id: 9,
      department: { id: 9, name: "Operations" },
      owner_id: 2,
    });
    mockGetLinkedRisks.mockResolvedValue([]);
    mockListVisibleUsers.mockResolvedValue([]);
    mockGetVendors.mockResolvedValue({
      items: [
        { id: 12, name: "Vendor Twelve", status: "active" },
        { id: 21, name: "Vendor Twenty-One", status: "active" },
      ],
      total: 2,
      skip: 0,
      limit: 25,
    });
  });

  it("shows the approval banner and stays on the edit form when the update is queued", async () => {
    mockUpdateKri.mockResolvedValue({
      approval_id: 88,
      message: "KRI update submitted for approval.",
    });

    renderEditForm();
    await advanceToDetailsAndSelectVendor();

    fireEvent.click(
      screen.getByRole("button", { name: /Edit KRI|Upravit KRI/i }),
    );

    await waitFor(() => {
      expect(mockUpdateKri).toHaveBeenCalledWith(
        21,
        expect.objectContaining({
          metric_name: "Claims Leakage Ratio",
          description: "Monitors operational leakage trend.",
          linked_vendor_ids: [12, 21],
        }),
      );
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/KRI update submitted for approval\./i),
    ).toBeVisible();
  });

  it("navigates to the KRI detail page when the update applies immediately", async () => {
    mockUpdateKri.mockResolvedValue({
      id: 21,
      metric_name: "Claims Leakage Ratio",
    });

    renderEditForm();
    await advanceToDetailsAndSelectVendor();

    fireEvent.click(
      screen.getByRole("button", { name: /Edit KRI|Upravit KRI/i }),
    );

    await waitFor(() => {
      expect(mockUpdateKri).toHaveBeenCalledWith(
        21,
        expect.objectContaining({
          linked_vendor_ids: [12, 21],
        }),
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/kris/21");
    });
  });
});

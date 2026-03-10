"use client";

import type { CompanySettings, SupplierAccount } from "@package/shared";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";

type SupplierName = "Home Depot Pro" | "Copper Electric Supply" | "HZ Electric Supply";

const SUPPLIERS: SupplierName[] = ["Home Depot Pro", "Copper Electric Supply", "HZ Electric Supply"];

type SupplierForm = {
  username: string;
  encryptedPassword: string;
  apiToken: string;
};

type CompanyAuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "estimator" | "viewer";
  isActive: boolean;
  createdAt: string;
};

function asNumber(value: string): number {
  return Number(value);
}

export default function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [users, setUsers] = useState<CompanyAuthUser[]>([]);
  const [status, setStatus] = useState("Loading company settings...");
  const [saving, setSaving] = useState(false);
  const [invitedTempPassword, setInvitedTempPassword] = useState("");
  const [inviteForm, setInviteForm] = useState<{
    fullName: string;
    email: string;
    role: "admin" | "estimator" | "viewer";
  }>({
    fullName: "",
    email: "",
    role: "estimator"
  });
  const [supplierForms, setSupplierForms] = useState<Record<SupplierName, SupplierForm>>({
    "Home Depot Pro": { username: "", encryptedPassword: "", apiToken: "" },
    "Copper Electric Supply": { username: "", encryptedPassword: "", apiToken: "" },
    "HZ Electric Supply": { username: "", encryptedPassword: "", apiToken: "" }
  });

  useEffect(() => {
    void (async () => {
      const [settingsResp, suppliersResp, usersResp] = await Promise.all([
        fetch("/api/company/settings", { cache: "no-store" }),
        fetch("/api/company/supplier-accounts", { cache: "no-store" }),
        fetch("/api/auth/admin/users", { cache: "no-store" })
      ]);
      const settingsPayload = (await settingsResp.json()) as { message?: string; settings?: CompanySettings };
      const suppliersPayload = (await suppliersResp.json()) as {
        message?: string;
        supplierAccounts?: SupplierAccount[];
      };
      const usersPayload = (await usersResp.json()) as { message?: string; users?: CompanyAuthUser[] };

      if (!settingsResp.ok || !settingsPayload.settings) {
        setStatus(settingsPayload.message ?? "Could not load company settings.");
        return;
      }

      if (suppliersResp.ok && suppliersPayload.supplierAccounts) {
        const next = { ...supplierForms };
        for (const account of suppliersPayload.supplierAccounts) {
          const supplierName = account.supplierName as SupplierName;
          next[supplierName] = {
            username: account.username ?? "",
            encryptedPassword: account.encryptedPassword ?? "",
            apiToken: account.apiToken ?? ""
          };
        }
        setSupplierForms(next);
      }

      if (usersResp.ok && usersPayload.users) {
        setUsers(usersPayload.users);
      }

      setSettings(settingsPayload.settings);
      setStatus("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) {
    return (
      <AppShell title="Company Settings">
        <section className="card">{status}</section>
      </AppShell>
    );
  }

  const settingsDraft = {
    ...settings,
    preferredWireBrand: settings.preferredWireBrand ?? "",
    preferredDeviceBrand: settings.preferredDeviceBrand ?? "",
    preferredBreakerBrand: settings.preferredBreakerBrand ?? ""
  };

  async function saveSettings() {
    setSaving(true);
    setStatus("Saving company settings...");
    const payload = {
      defaultLaborRate: settingsDraft.defaultLaborRate,
      apprenticeLaborRate: settingsDraft.apprenticeLaborRate,
      laborBurdenPercentage: settingsDraft.laborBurdenPercentage,
      materialMarkupPercentage: settingsDraft.materialMarkupPercentage,
      overheadPercentage: settingsDraft.overheadPercentage,
      profitMarginPercentage: settingsDraft.profitMarginPercentage,
      preferredWireBrand: settingsDraft.preferredWireBrand || null,
      preferredDeviceBrand: settingsDraft.preferredDeviceBrand || null,
      preferredBreakerBrand: settingsDraft.preferredBreakerBrand || null,
      defaultUtilityProvider: settingsDraft.defaultUtilityProvider,
      defaultVoltageSystem: settingsDraft.defaultVoltageSystem,
      defaultPricePerPoint: settingsDraft.defaultPricePerPoint,
      defaultCostPerSquareFoot: settingsDraft.defaultCostPerSquareFoot,
      defaultLaborHoursPerPoint: settingsDraft.defaultLaborHoursPerPoint,
      defaultCrewSize: settingsDraft.defaultCrewSize,
      loadCalculationMethod: settingsDraft.loadCalculationMethod
    };

    const response = await fetch("/api/company/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as { message?: string; settings?: CompanySettings };
    if (!response.ok || !data.settings) {
      setStatus(data.message ?? "Could not save company settings.");
      setSaving(false);
      return;
    }

    setSettings(data.settings);
    setStatus("Company settings saved.");
    setSaving(false);
  }

  async function saveSupplier(supplierName: SupplierName) {
    setStatus(`Saving ${supplierName} account...`);
    const supplier = supplierForms[supplierName];
    const response = await fetch("/api/company/supplier-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierName,
        username: supplier.username || null,
        encryptedPassword: supplier.encryptedPassword || null,
        apiToken: supplier.apiToken || null
      })
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setStatus(data.message ?? `Could not save ${supplierName} account.`);
      return;
    }
    setStatus(`${supplierName} account saved.`);
  }

  async function inviteUser() {
    setInvitedTempPassword("");
    setStatus("Inviting user...");
    const response = await fetch("/api/auth/admin/invite-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        role: inviteForm.role
      })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      invitedUser?: CompanyAuthUser;
      temporaryPassword?: string;
    };
    if (!response.ok || !payload.invitedUser || !payload.temporaryPassword) {
      setStatus(payload.message ?? "Could not invite user.");
      return;
    }

    setInvitedTempPassword(payload.temporaryPassword);
    setInviteForm({ fullName: "", email: "", role: "estimator" });
    setUsers((existing) => [payload.invitedUser as CompanyAuthUser, ...existing]);
    setStatus(`User invited: ${payload.invitedUser.email}`);
  }

  return (
    <AppShell title="Company Settings">
      <section className="card">
        <h3>Labor and Markup Defaults</h3>
        <p className="muted">Admin users can configure company-wide defaults used by estimates and takeoffs.</p>
        <div className="form-grid">
          <label className="field">
            Electrician Labor Rate
            <input
              type="number"
              value={settingsDraft.defaultLaborRate}
              onChange={(event) => setSettings({ ...settingsDraft, defaultLaborRate: asNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            Apprentice Labor Rate
            <input
              type="number"
              value={settingsDraft.apprenticeLaborRate}
              onChange={(event) => setSettings({ ...settingsDraft, apprenticeLaborRate: asNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            Labor Burden %
            <input
              type="number"
              value={settingsDraft.laborBurdenPercentage}
              onChange={(event) =>
                setSettings({ ...settingsDraft, laborBurdenPercentage: asNumber(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Material Markup %
            <input
              type="number"
              value={settingsDraft.materialMarkupPercentage}
              onChange={(event) =>
                setSettings({ ...settingsDraft, materialMarkupPercentage: asNumber(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Overhead %
            <input
              type="number"
              value={settingsDraft.overheadPercentage}
              onChange={(event) => setSettings({ ...settingsDraft, overheadPercentage: asNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            Profit Margin %
            <input
              type="number"
              value={settingsDraft.profitMarginPercentage}
              onChange={(event) =>
                setSettings({ ...settingsDraft, profitMarginPercentage: asNumber(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Default Price Per Point
            <input
              type="number"
              value={settingsDraft.defaultPricePerPoint}
              onChange={(event) => setSettings({ ...settingsDraft, defaultPricePerPoint: asNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            Default Cost Per Sq Ft
            <input
              type="number"
              value={settingsDraft.defaultCostPerSquareFoot}
              onChange={(event) =>
                setSettings({ ...settingsDraft, defaultCostPerSquareFoot: asNumber(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Default Labor Hours Per Point
            <input
              type="number"
              value={settingsDraft.defaultLaborHoursPerPoint}
              onChange={(event) =>
                setSettings({ ...settingsDraft, defaultLaborHoursPerPoint: asNumber(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Default Crew Size
            <input
              type="number"
              value={settingsDraft.defaultCrewSize}
              onChange={(event) => setSettings({ ...settingsDraft, defaultCrewSize: asNumber(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="card section-gap">
        <h3>Utility and Code</h3>
        <div className="form-grid">
          <label className="field">
            Utility Provider
            <select
              value={settingsDraft.defaultUtilityProvider}
              onChange={(event) =>
                setSettings({
                  ...settingsDraft,
                  defaultUtilityProvider: event.target.value as CompanySettings["defaultUtilityProvider"]
                })
              }
            >
              <option value="Central Hudson">Central Hudson</option>
              <option value="NYSEG">NYSEG</option>
            </select>
          </label>
          <label className="field">
            Voltage System
            <select
              value={settingsDraft.defaultVoltageSystem}
              onChange={(event) =>
                setSettings({
                  ...settingsDraft,
                  defaultVoltageSystem: event.target.value as CompanySettings["defaultVoltageSystem"]
                })
              }
            >
              <option value="120/240">120/240</option>
              <option value="120/208">120/208</option>
              <option value="277/480">277/480</option>
            </select>
          </label>
          <label className="field">
            Load Calculation Method
            <select
              value={settingsDraft.loadCalculationMethod}
              onChange={(event) =>
                setSettings({
                  ...settingsDraft,
                  loadCalculationMethod: event.target.value as CompanySettings["loadCalculationMethod"]
                })
              }
            >
              <option value="NEC Standard Method">NEC Standard Method</option>
              <option value="NEC Optional Method">NEC Optional Method</option>
            </select>
          </label>
          <label className="field">
            Electrical Code Version
            <input value={settingsDraft.electricalCodeVersion} disabled />
          </label>
        </div>
      </section>

      <section className="card section-gap">
        <h3>Material Preferences</h3>
        <div className="form-grid">
          <label className="field">
            Preferred Wire Brand
            <input
              value={settingsDraft.preferredWireBrand}
              onChange={(event) => setSettings({ ...settingsDraft, preferredWireBrand: event.target.value })}
              placeholder="Southwire or Encore"
            />
          </label>
          <label className="field">
            Preferred Device Brand
            <input
              value={settingsDraft.preferredDeviceBrand}
              onChange={(event) => setSettings({ ...settingsDraft, preferredDeviceBrand: event.target.value })}
              placeholder="Leviton, Legrand, or Lutron"
            />
          </label>
          <label className="field">
            Preferred Breaker Brand
            <input
              value={settingsDraft.preferredBreakerBrand}
              onChange={(event) => setSettings({ ...settingsDraft, preferredBreakerBrand: event.target.value })}
              placeholder="Square D, Eaton, or Siemens"
            />
          </label>
        </div>
        <div className="row actions">
          <button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? "Saving..." : "Save Company Settings"}
          </button>
        </div>
      </section>

      <section className="card section-gap">
        <h3>User Management</h3>
        <p className="muted">Admin only. Invite company users and provide temporary password for first login.</p>
        <div className="form-grid">
          <label className="field">
            Full Name
            <input
              value={inviteForm.fullName}
              onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })}
              placeholder="Estimator Name"
            />
          </label>
          <label className="field">
            Email
            <input
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
              placeholder="user@company.com"
            />
          </label>
          <label className="field">
            Role
            <select
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm({ ...inviteForm, role: event.target.value as "admin" | "estimator" | "viewer" })
              }
            >
              <option value="admin">Admin</option>
              <option value="estimator">Estimator</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        </div>
        <div className="row actions">
          <button className="secondary" type="button" onClick={() => void inviteUser()}>
            Invite User
          </button>
        </div>
        {invitedTempPassword && (
          <p className="status-text">Temporary password (share securely): {invitedTempPassword}</p>
        )}
        <table className="section-gap">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4}>No users found for this company.</td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.isActive ? "active" : "inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card section-gap">
        <h3>Supplier Integrations</h3>
        <p className="muted">Configure company-specific supplier credentials.</p>
        {SUPPLIERS.map((supplierName) => (
          <div key={supplierName} className="card section-gap">
            <h3>{supplierName}</h3>
            <div className="form-grid">
              <label className="field">
                Username
                <input
                  value={supplierForms[supplierName].username}
                  onChange={(event) =>
                    setSupplierForms({
                      ...supplierForms,
                      [supplierName]: { ...supplierForms[supplierName], username: event.target.value }
                    })
                  }
                />
              </label>
              <label className="field">
                Encrypted Password
                <input
                  value={supplierForms[supplierName].encryptedPassword}
                  onChange={(event) =>
                    setSupplierForms({
                      ...supplierForms,
                      [supplierName]: { ...supplierForms[supplierName], encryptedPassword: event.target.value }
                    })
                  }
                />
              </label>
              <label className="field">
                API Token
                <input
                  value={supplierForms[supplierName].apiToken}
                  onChange={(event) =>
                    setSupplierForms({
                      ...supplierForms,
                      [supplierName]: { ...supplierForms[supplierName], apiToken: event.target.value }
                    })
                  }
                />
              </label>
            </div>
            <div className="row actions">
              <button className="secondary" onClick={() => void saveSupplier(supplierName)}>
                Save {supplierName}
              </button>
            </div>
          </div>
        ))}
      </section>

      {status && <p className="status-text">{status}</p>}
    </AppShell>
  );
}

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';

type Member = {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role_name: string;
  is_active: boolean;
};

export function SettingsPage() {
  const { session, activeOrg } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Bookkeeper');
  const [inviteName, setInviteName] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [m, r] = await Promise.all([
        api.members.list(session.accessToken, activeOrg.id),
        api.members.roles(session.accessToken, activeOrg.id),
      ]);
      setMembers(m);
      setRoles(r.filter((x) => x.name !== 'Owner'));
      if (r.some((x) => x.name === 'Bookkeeper')) setInviteRole('Bookkeeper');
      else if (r.length) setInviteRole(r.find((x) => x.name !== 'Owner')?.name || r[0].name);
    } catch (err: any) {
      setError(err?.message || 'Could not load team (org.manage permission required)');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeOrg) return;
    setInviting(true);
    setInviteResult(null);
    setError(null);
    try {
      const result = await api.members.invite(session.accessToken, activeOrg.id, {
        email: inviteEmail,
        roleName: inviteRole,
        fullName: inviteName || undefined,
      });
      setInviteResult(
        result.tempPassword
          ? `Invited ${result.email}. Temporary password: ${result.tempPassword} — share securely.`
          : `Added existing user ${result.email} as ${result.roleName}.`,
      );
      setInviteEmail('');
      setInviteName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(membershipId: string, roleName: string) {
    if (!session || !activeOrg) return;
    try {
      await api.members.updateRole(session.accessToken, activeOrg.id, membershipId, roleName);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not update role');
    }
  }

  async function handleDeactivate(membershipId: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Deactivate this member? They will lose access to the organization.')) return;
    try {
      await api.members.deactivate(session.accessToken, activeOrg.id, membershipId);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not deactivate');
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Settings</h1>
        <p className="text-sm text-ink/50 mt-0.5">
          Organization team and roles · {activeOrg?.name}
        </p>
      </div>

      {error && (
        <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>
      )}
      {inviteResult && (
        <p className="text-sm text-ledger bg-ledger-soft rounded-md px-3 py-2 mb-4">{inviteResult}</p>
      )}

      <div className="rounded-lg border border-ink/10 bg-white p-5 mb-6 max-w-xl">
        <h2 className="text-sm font-medium mb-3">Invite team member</h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Email</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink/60 mb-1 block">Full name (optional)</label>
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 disabled:opacity-50"
          >
            {inviting ? 'Inviting…' : 'Send invite'}
          </button>
          <p className="text-xs text-ink/40">
            New users receive a temporary password shown once (no email gateway in this build).
          </p>
        </form>
      </div>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        <h2 className="text-sm font-medium px-5 pt-4 pb-2">Team members</h2>
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : members.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No members found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membership_id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3">{m.full_name}</td>
                  <td className="px-5 py-3 text-ink/70">{m.email}</td>
                  <td className="px-5 py-3">
                    {m.role_name === 'Owner' || !m.is_active ? (
                      <span className="text-ink/70">{m.role_name}</span>
                    ) : (
                      <select
                        value={m.role_name}
                        onChange={(e) => handleRoleChange(m.membership_id, e.target.value)}
                        className="border border-ink/15 rounded-md px-2 py-1 text-sm bg-white"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                        {/* keep current if not in list */}
                        {!roles.some((r) => r.name === m.role_name) && (
                          <option value={m.role_name}>{m.role_name}</option>
                        )}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {m.is_active ? (
                      <span className="text-ledger">Active</span>
                    ) : (
                      <span className="text-ink/40">Inactive</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {m.is_active && m.role_name !== 'Owner' && (
                      <button
                        onClick={() => handleDeactivate(m.membership_id)}
                        className="text-xs text-brick hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

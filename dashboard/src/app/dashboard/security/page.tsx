'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import {
  ShieldCheck,
  Smartphone,
  Monitor,
  Laptop,
  Tablet,
  Lock,
  Loader2,
  LogOut,
  Mail,
  Send,
  ShoppingCart,
  Trash2,
  Terminal,
  Globe,
  AlertTriangle,
  Check,
  QrCode,
} from 'lucide-react';

interface Session {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
  type: 'desktop' | 'mobile' | 'tablet';
}

interface ActionApprovals {
  sendEmails: boolean;
  makePurchases: boolean;
  deleteFiles: boolean;
  runCommands: boolean;
  postSocial: boolean;
}

interface SecurityData {
  sessions: Session[];
  loginAlerts: boolean;
  twoFactorEnabled: boolean;
  actionApprovals: ActionApprovals;
}

const deviceIcons: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData>({
    sessions: [],
    loginAlerts: true,
    twoFactorEnabled: false,
    actionApprovals: {
      sendEmails: true,
      makePurchases: true,
      deleteFiles: true,
      runCommands: false,
      postSocial: true,
    },
  });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: '', new_pw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [twoFaModal, setTwoFaModal] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    api.get<SecurityData>('/security')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function revokeSession(sessionId: string) {
    try {
      await api.delete(`/security/sessions/${sessionId}`);
      setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== sessionId) }));
    } catch {}
  }

  async function revokeAllOtherSessions() {
    setSigningOutAll(true);
    try {
      await api.post('/security/sessions/revoke-all');
      setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.current) }));
    } catch {}
    setSigningOutAll(false);
  }

  async function handleChangePassword() {
    setPwError('');
    setPwSuccess(false);
    if (passwords.new_pw.length < 8) {
      setPwError('Please use at least 8 characters for your new password.');
      return;
    }
    if (passwords.new_pw !== passwords.confirm) {
      setPwError('The passwords you entered don\'t match. Please try again.');
      return;
    }
    setPwSaving(true);
    try {
      await api.put('/security/password', {
        currentPassword: passwords.current,
        newPassword: passwords.new_pw,
      });
      setPasswords({ current: '', new_pw: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError('Something went wrong. Please check your current password and try again.');
    } finally {
      setPwSaving(false);
    }
  }

  async function toggleLoginAlerts(val: boolean) {
    setData((d) => ({ ...d, loginAlerts: val }));
    try {
      await api.put('/security/alerts', { loginAlerts: val });
    } catch {
      setData((d) => ({ ...d, loginAlerts: !val }));
    }
  }

  async function toggleTwoFactor() {
    if (!data.twoFactorEnabled) {
      setTwoFaModal(true);
    } else {
      setData((d) => ({ ...d, twoFactorEnabled: false }));
      try {
        await api.put('/security/2fa', { enabled: false });
      } catch {
        setData((d) => ({ ...d, twoFactorEnabled: true }));
      }
    }
  }

  async function confirmTwoFaSetup() {
    setData((d) => ({ ...d, twoFactorEnabled: true }));
    setTwoFaModal(false);
    try {
      await api.put('/security/2fa', { enabled: true });
    } catch {
      setData((d) => ({ ...d, twoFactorEnabled: false }));
    }
  }

  function updateApproval(key: keyof ActionApprovals, val: boolean) {
    setData((d) => ({ ...d, actionApprovals: { ...d.actionApprovals, [key]: val } }));
    api.put('/security/approvals', { [key]: val }).catch(() => {
      setData((d) => ({ ...d, actionApprovals: { ...d.actionApprovals, [key]: !val } }));
    });
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const otherSessions = data.sessions.filter((s) => !s.current);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Security</h1>
        <p className="mt-2 text-[15px] text-white/50 leading-relaxed">
          Keep your account safe. Manage who can access your account and what your agent is allowed to do.
        </p>
      </div>

      {/* Two-Factor Authentication */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                {data.twoFactorEnabled
                  ? 'Your account has an extra layer of protection.'
                  : 'Add a second step when you log in for extra safety.'}
              </CardDescription>
            </div>
          </div>
          <Toggle
            enabled={data.twoFactorEnabled}
            onChange={toggleTwoFactor}
          />
        </div>
        {data.twoFactorEnabled && (
          <div className="mt-4 flex items-center gap-2">
            <Badge variant="green">Protected</Badge>
            <span className="text-[13px] text-white/40">Authenticator app is set up</span>
          </div>
        )}
      </Card>

      {/* Active Sessions */}
      <Card>
        <div className="mb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/10">
              <Laptop className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>Devices that are currently signed into your account.</CardDescription>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {data.sessions.map((session) => {
            const DeviceIcon = deviceIcons[session.type] || Monitor;
            return (
              <GlassPanel key={session.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <DeviceIcon className="h-5 w-5 text-white/40" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-white">{session.device}</span>
                      <span className="text-[13px] text-white/30">—</span>
                      <span className="text-[13px] text-white/50">{session.location}</span>
                      <span className="text-[13px] text-white/30">—</span>
                      <span className="text-[13px] text-white/50">
                        {session.current ? 'Now' : timeAgo(session.lastActive)}
                      </span>
                    </div>
                    {session.current && (
                      <Badge variant="green" className="mt-1">This device</Badge>
                    )}
                  </div>
                </div>
                {!session.current && (
                  <Button variant="ghost" size="sm" onClick={() => revokeSession(session.id)}>
                    <LogOut className="h-4 w-4 text-red-400" />
                    <span className="text-red-400">Sign Out</span>
                  </Button>
                )}
              </GlassPanel>
            );
          })}
        </div>

        {otherSessions.length > 0 && (
          <div className="mt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={revokeAllOtherSessions}
              loading={signingOutAll}
            >
              <LogOut className="h-4 w-4" />
              Sign Out All Other Devices
            </Button>
          </div>
        )}
      </Card>

      {/* Action Approvals */}
      <Card>
        <div className="mb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/10">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle>Action Approvals</CardTitle>
              <CardDescription>Ask me before your agent does these:</CardDescription>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <GlassPanel>
            <Toggle
              enabled={data.actionApprovals.sendEmails}
              onChange={(v) => updateApproval('sendEmails', v)}
              label="Sending emails on my behalf"
              description="Your agent will ask before sending any email from your account."
            />
          </GlassPanel>
          <GlassPanel>
            <Toggle
              enabled={data.actionApprovals.makePurchases}
              onChange={(v) => updateApproval('makePurchases', v)}
              label="Making purchases or bookings"
              description="Get a confirmation before your agent spends money or books anything."
            />
          </GlassPanel>
          <GlassPanel>
            <Toggle
              enabled={data.actionApprovals.deleteFiles}
              onChange={(v) => updateApproval('deleteFiles', v)}
              label="Deleting any files"
              description="Your agent will check with you before removing any documents or files."
            />
          </GlassPanel>
          <GlassPanel>
            <Toggle
              enabled={data.actionApprovals.runCommands}
              onChange={(v) => updateApproval('runCommands', v)}
              label="Running system commands"
              description="Adds an approval step before your agent runs anything on your computer."
            />
          </GlassPanel>
          <GlassPanel>
            <Toggle
              enabled={data.actionApprovals.postSocial}
              onChange={(v) => updateApproval('postSocial', v)}
              label="Posting to social media"
              description="Your agent will show you the post and wait for your OK before publishing."
            />
          </GlassPanel>
        </div>
      </Card>

      {/* Login Alerts */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06]">
              <Mail className="h-5 w-5 text-white/40" />
            </div>
            <div>
              <CardTitle>Login Alerts</CardTitle>
              <CardDescription>Email me when someone logs in from a new device.</CardDescription>
            </div>
          </div>
          <Toggle enabled={data.loginAlerts} onChange={toggleLoginAlerts} />
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <div className="mb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/10">
              <Lock className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure.</CardDescription>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Current password"
            type="password"
            placeholder="Enter your current password"
            value={passwords.current}
            onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
          />
          <Input
            label="New password"
            type="password"
            placeholder="At least 8 characters"
            value={passwords.new_pw}
            onChange={(e) => setPasswords((p) => ({ ...p, new_pw: e.target.value }))}
            hint="Use a mix of letters, numbers, and symbols for a strong password."
          />
          <Input
            label="Confirm new password"
            type="password"
            placeholder="Type your new password again"
            value={passwords.confirm}
            onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
            error={pwError}
          />

          {pwSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3">
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-[14px] text-emerald-400">Password updated successfully!</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleChangePassword} loading={pwSaving}>
              <Lock className="h-4 w-4" />
              Update Password
            </Button>
          </div>
        </div>
      </Card>

      {/* 2FA Setup Modal */}
      <Modal
        open={twoFaModal}
        onClose={() => setTwoFaModal(false)}
        title="Set Up Two-Factor Authentication"
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-white">
              <QrCode className="h-32 w-32 text-gray-900" />
            </div>
          </div>
          <p className="text-center text-[13px] text-white/40">
            After scanning, enter the 6-digit code from your app to confirm.
          </p>
          <Input
            label="Verification code"
            placeholder="Enter the 6-digit code"
            className="text-center tracking-[0.3em] text-lg"
          />
          <div className="flex justify-end gap-3">
            <Button variant="glass" onClick={() => setTwoFaModal(false)}>
              Cancel
            </Button>
            <Button onClick={confirmTwoFaSetup}>
              <ShieldCheck className="h-4 w-4" />
              Enable 2FA
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

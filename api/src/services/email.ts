import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM || 'OpenClaw <noreply@yourdomain.com>';

export async function sendWelcomeEmail(
  email: string,
  subdomain: string,
  domain: string
): Promise<void> {
  await resend.emails.send({
    from,
    to: email,
    subject: 'Your AI Agent is Ready!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a2e;">Welcome to OpenClaw!</h1>
        <p>Your personal AI agent is live and ready to go.</p>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="margin: 0; color: #666;">Your Agent Dashboard</p>
          <a href="https://${subdomain}.${domain}" style="font-size: 18px; color: #6366f1; font-weight: 600;">
            https://${subdomain}.${domain}
          </a>
        </div>
        <h2 style="color: #1a1a2e;">Quick Start</h2>
        <ol>
          <li>Open your <a href="https://${process.env.PLATFORM_URL}/dashboard">Platform Dashboard</a></li>
          <li>Connect a messaging app (Telegram is easiest)</li>
          <li>Send your first message to your agent</li>
        </ol>
        <p style="color: #999; font-size: 14px; margin-top: 40px;">
          Need help? Reply to this email or visit our docs.
        </p>
      </div>
    `,
  });
}

export async function sendTokenAlert(
  email: string,
  type: 'LOW_BALANCE' | 'OUT_OF_TOKENS',
  message: string
): Promise<void> {
  const subject =
    type === 'OUT_OF_TOKENS'
      ? 'Agent Paused - Token Balance Empty'
      : 'Low Token Balance Warning';

  await resend.emails.send({
    from,
    to: email,
    subject,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: ${type === 'OUT_OF_TOKENS' ? '#dc2626' : '#f59e0b'};">
          ${type === 'OUT_OF_TOKENS' ? 'Agent Paused' : 'Low Balance Warning'}
        </h1>
        <p>${message}</p>
        <a href="${process.env.PLATFORM_URL}/dashboard/tokens"
           style="display: inline-block; background: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-top: 16px;">
          Top Up Tokens
        </a>
      </div>
    `,
  });
}

export async function sendSecurityAlert(
  email: string,
  event: string,
  details: string
): Promise<void> {
  await resend.emails.send({
    from,
    to: email,
    subject: `Security Alert: ${event}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Security Alert</h1>
        <p><strong>${event}</strong></p>
        <p>${details}</p>
        <p style="color: #999;">If this wasn't you, please secure your account immediately.</p>
      </div>
    `,
  });
}

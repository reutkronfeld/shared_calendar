import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendNegotiationEmail(params: {
  to: string;
  userName: string;
  groupName: string;
  meetingTitle: string;
  meetingTime: string;
  negotiationUrl: string;
}) {
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn('[resend] No API key set. Email not sent:', params);
    return;
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`[resend] Sending negotiation email to ${params.to} for meeting "${params.meetingTitle}"`);
    await resend.emails.send({
      from: 'Calendar Assistant <onboarding@resend.dev>', // Use verified domain in prod
      to: params.to,
      subject: `Action Needed: Group Meeting Negotiation for ${params.groupName}`,
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.6;">
          <h2>היי ${params.userName},</h2>
          <p>הקבוצה שלך <strong>${params.groupName}</strong> מנסה לקבוע פגישה בשם "<strong>${params.meetingTitle}</strong>" במועד הבא:</p>
          <p style="font-size: 1.1em; color: #2563eb;">${params.meetingTime}</p>
          <p>נראה שיש לך אירוע גמיש שחוסם את המועד הזה. נשמח אם תוכל/י לבדוק אם אפשר להזיז אותו כדי שכולם יוכלו להיפגש.</p>
          <p style="margin-top: 25px;">
            <a href="${params.negotiationUrl}" style="background: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              לשיחה פרטית עם העוזר האישי לתיאום
            </a>
          </p>
          <p style="margin-top: 30px; font-size: 0.9em; color: #666;">
            הקישור יוביל אותך לצ'אט פרטי שבו תוכל/י לראות את פרטי האירוע ולהחליט אם להזיז אותו.
          </p>
        </div>
      `,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[resend] Failed to send email:', err);
  }
}

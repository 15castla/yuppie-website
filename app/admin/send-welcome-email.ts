const SITE_URL = "https://clubyuppie.com";

export async function sendWelcomeEmail({
  to,
  fullName,
  inviteCode,
}: {
  to: string;
  fullName: string | null;
  inviteCode: string;
}) {
  const firstName = fullName?.trim().split(" ")[0] || "there";
  const signupUrl = `${SITE_URL}/signup?code=${encodeURIComponent(inviteCode)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>You're in - welcome to Yuppie</title>
    <style>
      :root {
        color-scheme: light;
        supported-color-schemes: light;
      }
      body {
        margin: 0;
        padding: 0;
        width: 100% !important;
      }
      .bg-outer,
      .bg-card,
      .text-dark,
      .btn-bg,
      .btn-text,
      .footer-text {
        transition: none !important;
      }
      @media (prefers-color-scheme: dark) {
        body,
        .bg-outer {
          background-color: #ffd904 !important;
        }
        .bg-card {
          background-color: #f5f3e7 !important;
        }
        .text-dark {
          color: #1b1512 !important;
        }
        .btn-bg {
          background-color: #1b1512 !important;
        }
        .btn-text {
          color: #ffd904 !important;
        }
        .footer-text {
          color: rgba(27, 21, 18, 0.5) !important;
        }
      }
      /* Outlook's own dark-mode rewriter tags elements it has recolored
         with data-ogsc (text) / data-ogsb (background) instead of respecting
         color-scheme or prefers-color-scheme, so force our palette back on
         those specifically. */
      [data-ogsc] .text-dark,
      .text-dark[data-ogsc] {
        color: #1b1512 !important;
      }
      [data-ogsc] .btn-text,
      .btn-text[data-ogsc] {
        color: #ffd904 !important;
      }
      [data-ogsc] .footer-text,
      .footer-text[data-ogsc] {
        color: rgba(27, 21, 18, 0.5) !important;
      }
      [data-ogsb] .bg-outer,
      .bg-outer[data-ogsb] {
        background-color: #ffd904 !important;
      }
      [data-ogsb] .bg-card,
      .bg-card[data-ogsb] {
        background-color: #f5f3e7 !important;
      }
      [data-ogsb] .btn-bg,
      .btn-bg[data-ogsb] {
        background-color: #1b1512 !important;
      }
    </style>
  </head>
  <body class="bg-outer" bgcolor="#FFD904" style="margin:0;padding:0;background-color:#FFD904;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFD904" class="bg-outer" style="background-color:#FFD904;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F3E7" class="bg-card" style="max-width:480px;width:100%;background-color:#F5F3E7;border-radius:24px;">
            <tr>
              <td align="center" style="padding:40px 32px;">
                <img src="${SITE_URL}/yuppie_logo_forte_forward.png" alt="Yuppie" width="160" style="height:auto;display:block;margin:0 0 24px;" />
                <h1 class="text-dark" style="font-size:24px;font-weight:700;color:#1B1512;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">You're in, ${firstName}!</h1>
                <p class="text-dark" style="font-size:15px;line-height:1.6;color:#1B1512;margin:0 0 32px;font-family:Arial,Helvetica,sans-serif;">
                  Your application to Yuppie has been approved. Click below to create your account and get started.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#1B1512" class="btn-bg" style="background-color:#1B1512;border-radius:999px;">
                      <a href="${signupUrl}" class="btn-text" style="display:inline-block;color:#FFD904;font-weight:700;text-decoration:none;padding:14px 32px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Create your account</a>
                    </td>
                  </tr>
                </table>
                <p class="footer-text" style="font-size:12px;color:rgba(27,21,18,0.5);margin:32px 0 0;font-family:Arial,Helvetica,sans-serif;">
                  This link expires in 14 days.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Yuppie <noreply@clubyuppie.com>",
      to,
      subject: "You're in - welcome to Yuppie",
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body}`);
  }
}

const SITE_URL = "https://clubyuppie.com";

export function renderBrandedEmailHtml({
  documentTitle,
  heading,
  bodyText,
  ctaLabel,
  ctaUrl,
  footerText,
}: {
  documentTitle: string;
  heading: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  footerText: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${documentTitle}</title>
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
                <h1 class="text-dark" style="font-size:24px;font-weight:700;color:#1B1512;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${heading}</h1>
                <p class="text-dark" style="font-size:15px;line-height:1.6;color:#1B1512;margin:0 0 32px;font-family:Arial,Helvetica,sans-serif;">
                  ${bodyText}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#1B1512" class="btn-bg" style="background-color:#1B1512;border-radius:999px;">
                      <a href="${ctaUrl}" class="btn-text" style="display:inline-block;color:#FFD904;font-weight:700;text-decoration:none;padding:14px 32px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p class="footer-text" style="font-size:12px;color:rgba(27,21,18,0.5);margin:32px 0 0;font-family:Arial,Helvetica,sans-serif;">
                  ${footerText}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Almarai is loaded from Google Fonts for clients that support linked web
// fonts (Apple Mail, iOS Mail, some webmail); everything else falls back
// to Arial/Helvetica automatically since that's the next font in every
// font-family stack below.
const ALMARAI_FONT_STACK = "'Almarai',Arial,Helvetica,sans-serif";

export function renderWelcomeEmailHtml({
  documentTitle,
  preheaderText,
  heading,
  bodyText,
  ctaLabel,
  ctaUrl,
  footerText,
}: {
  documentTitle: string;
  preheaderText: string;
  heading: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  footerText: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${documentTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap" rel="stylesheet" />
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
      .footer-text,
      .footer-link {
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
          color: #6b6560 !important;
        }
        .footer-link {
          color: #1b1512 !important;
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
        color: #6b6560 !important;
      }
      [data-ogsc] .footer-link,
      .footer-link[data-ogsc] {
        color: #1b1512 !important;
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
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      ${preheaderText}
    </div>
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      &#8203;&#8199;&#8203;&#8199;&#8203;&#8199;&#8203;&#8199;&#8203;&#8199;&#8203;&#8199;&#8203;&#8199;&#8203;&#8199;
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFD904" class="bg-outer" style="background-color:#FFD904;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td align="center" style="padding:0 0 24px;">
                <img src="${SITE_URL}/yuppie_logo_forte_forward.png" alt="Yuppie" width="140" style="height:auto;display:block;width:140px;max-width:140px;" />
              </td>
            </tr>
            <tr>
              <td bgcolor="#F5F3E7" class="bg-card" style="background-color:#F5F3E7;border-radius:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="padding:40px 32px;">
                      <h1 class="text-dark" style="font-size:24px;font-weight:700;color:#1B1512;margin:0 0 16px;font-family:${ALMARAI_FONT_STACK};">${heading}</h1>
                      <p class="text-dark" style="font-size:15px;line-height:1.6;color:#1B1512;margin:0 0 32px;font-family:${ALMARAI_FONT_STACK};">
                        ${bodyText}
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" bgcolor="#1B1512" class="btn-bg" style="background-color:#1B1512;border-radius:999px;">
                            <a href="${ctaUrl}" class="btn-text" style="display:inline-block;color:#FFD904;font-weight:700;text-decoration:none;padding:14px 32px;font-size:15px;font-family:${ALMARAI_FONT_STACK};">${ctaLabel}</a>
                          </td>
                        </tr>
                      </table>
                      <p class="footer-text" style="font-size:12px;color:#6B6560;margin:32px 0 0;font-family:${ALMARAI_FONT_STACK};">
                        ${footerText}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 0 0;">
                <a href="${SITE_URL}" class="footer-link" style="font-size:12px;color:#1B1512;text-decoration:none;font-family:${ALMARAI_FONT_STACK};">Yuppie - Your Social Life, Curated</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

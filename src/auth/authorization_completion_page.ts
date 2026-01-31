// Requirements: E.T.4, E.A.23, E.A.24, E.A.25
export const getAuthorizationCompletionPage = (): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clerkly Authorization</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .card {
        max-width: 420px;
        margin: 12vh auto;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 28px;
        text-align: center;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      }
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-weight: 600;
        font-size: 24px;
      }
      .logo svg {
        width: 36px;
        height: 36px;
      }
      .title {
        margin: 20px 0 8px;
        font-size: 20px;
        font-weight: 600;
      }
      .subtitle {
        margin: 0 0 6px;
        color: #475569;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="16" cy="16" r="16" fill="url(#logo-gradient)" />
          <path
            d="M20 9C20 9 22 11 22 16C22 21 20 23 20 23"
            stroke="white"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <path
            d="M17 11C17 11 18.5 12.5 18.5 16C18.5 19.5 17 21 17 21"
            stroke="white"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <circle cx="12" cy="16" r="3" fill="white" />
          <defs>
            <linearGradient id="logo-gradient" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#5b6cf2" />
            </linearGradient>
          </defs>
        </svg>
        <span>Clerkly</span>
      </div>
      <div class="title">You're all set.</div>
      <p class="subtitle">Return to the Clerkly app to continue.</p>
    </div>
    <script>
      setTimeout(() => window.close(), 300);
    </script>
  </body>
</html>`;
};

/**
 * The consent screen. This is the one imogen page a user sees while standing inside
 * someone else's product, so it has to be legible on its own: who is asking, what they
 * get, and which account is about to grant it.
 */

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  )
}

export type ConsentView = {
  clientName: string
  clientUri: string | null
  userName: string
  userEmail: string
  scopes: Array<{ scope: string; description: string }>
  query: Record<string, string>
}

export function renderConsent(view: ConsentView): string {
  const hidden = Object.entries(view.query)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`,
    )
    .join('')

  const scopeItems = view.scopes
    .map(
      (s) => `<li>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>
        <div><strong>${escapeHtml(s.description)}</strong><code>${escapeHtml(s.scope)}</code></div>
      </li>`,
    )
    .join('')

  const client = escapeHtml(view.clientName)
  const host = view.clientUri ? escapeHtml(new URL(view.clientUri).host) : null

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${client} · imogen</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f6f4;
    --panel: #fffffe;
    --ink: #1b1a17;
    --muted: #6f6b64;
    --line: #e4e1db;
    --accent: #2f6f4f;
    --accent-ink: #ffffff;
    --danger-ink: #8a3b32;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16150f;
      --panel: #201e18;
      --ink: #f2efe6;
      --muted: #a09a8c;
      --line: #322f26;
      --accent: #7fbf95;
      --accent-ink: #10231a;
      --danger-ink: #e2a49b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main {
    width: min(30rem, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 2rem;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px rgb(0 0 0 / 0.06);
  }
  .brand {
    display: flex; align-items: center; gap: .5rem;
    font-weight: 600; letter-spacing: -0.01em; color: var(--muted);
    margin-bottom: 1.5rem; font-size: .875rem;
  }
  .brand span { width: .55rem; height: .55rem; border-radius: 50%; background: var(--accent); }
  h1 { font-size: 1.35rem; line-height: 1.3; margin: 0 0 .4rem; letter-spacing: -0.02em; }
  h1 em { font-style: normal; }
  .sub { color: var(--muted); margin: 0 0 1.5rem; font-size: .925rem; }
  ul { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: .625rem; }
  li { display: flex; gap: .625rem; align-items: flex-start; }
  li svg {
    width: 1.05rem; height: 1.05rem; flex: none; margin-top: .2rem;
    fill: none; stroke: var(--accent); stroke-width: 2.25;
    stroke-linecap: round; stroke-linejoin: round;
  }
  li strong { display: block; font-weight: 500; font-size: .95rem; }
  li code { color: var(--muted); font-size: .75rem; font-family: ui-monospace, monospace; }
  .who {
    display: flex; align-items: center; gap: .625rem;
    border-top: 1px solid var(--line); padding-top: 1rem; margin-bottom: 1.5rem;
    color: var(--muted); font-size: .85rem;
  }
  .avatar {
    width: 2rem; height: 2rem; border-radius: 50%; flex: none;
    background: var(--accent); color: var(--accent-ink);
    display: grid; place-items: center; font-weight: 600; font-size: .8rem;
  }
  .actions { display: flex; gap: .75rem; }
  button {
    flex: 1; padding: .7rem 1rem; border-radius: 9px; font-size: .95rem;
    font-weight: 500; cursor: pointer; font-family: inherit;
    border: 1px solid var(--line); background: transparent; color: var(--danger-ink);
  }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  button:hover { filter: brightness(0.97); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .fine { margin: 1.25rem 0 0; font-size: .775rem; color: var(--muted); text-align: center; }
</style>
</head>
<body>
<main>
  <div class="brand"><span></span>imogen</div>

  <h1><em>${client}</em> wants access to your photos</h1>
  <p class="sub">${host ? `Requested by ${host}.` : 'This application is asking to connect to your library.'}</p>

  <ul>${scopeItems}</ul>

  <div class="who">
    <div class="avatar">${escapeHtml(view.userName.slice(0, 1).toUpperCase())}</div>
    <div>Signing in as <strong style="color:var(--ink)">${escapeHtml(view.userName)}</strong><br>${escapeHtml(view.userEmail)}</div>
  </div>

  <form method="get" action="/oauth/authorize" class="actions">
    ${hidden}
    <button type="submit" name="approved" value="no">Cancel</button>
    <button type="submit" name="approved" value="yes" class="primary">Allow access</button>
  </form>

  <p class="fine">You can revoke this at any time from your imogen settings.</p>
</main>
</body>
</html>`
}

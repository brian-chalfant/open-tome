export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Encode a value as a JavaScript string literal safe to embed inside a
 * double-quoted HTML event-handler attribute (e.g. onsubmit="confirm(...)").
 * HTML entities are decoded before the JS runs, so escHtml alone is not enough.
 */
export function jsStrAttr(s) {
  return escHtml(JSON.stringify(String(s ?? '')));
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatNumber(n) {
  return Number(n ?? 0).toLocaleString('en-US');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const NAV = [
  { href: '/admin/',         label: 'Dashboard' },
  { href: '/admin/users',    label: 'Users'     },
  { href: '/admin/projects', label: 'Projects'  },
  { href: '/admin/backups',  label: 'Backups'   },
];

export function layout(title, bodyHtml, { currentPath = '' } = {}) {
  const navHtml = NAV.map(({ href, label }) => {
    const active = currentPath === href
      || (href !== '/admin/' && currentPath.startsWith(href));
    return `<a href="${href}"${active ? ' class="active"' : ''}>${label}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)} — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
           background: #0f172a; color: #cbd5e1; min-height: 100vh; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav { background: #1e293b; border-bottom: 1px solid #334155;
          padding: 0 1.5rem; display: flex; align-items: center; gap: 0; height: 48px; }
    nav .brand { font-weight: 700; color: #f1f5f9; font-size: 15px; margin-right: 2rem; }
    nav a { color: #94a3b8; padding: 0 0.9rem; line-height: 48px; display: inline-block; }
    nav a:hover, nav a.active { color: #f1f5f9; text-decoration: none; }
    nav a.active { border-bottom: 2px solid #3b82f6; }
    nav .logout { margin-left: auto; }
    nav .logout button { background: #dc2626; color: #fff; border: none;
                         padding: 0.3rem 0.75rem; border-radius: 4px;
                         cursor: pointer; font-size: 13px; }
    nav .logout button:hover { background: #b91c1c; }
    main { padding: 1.5rem 2rem; max-width: 1200px; margin: 0 auto; }
    h1 { color: #f1f5f9; font-size: 1.4rem; margin-bottom: 1.5rem; }
    h2 { color: #e2e8f0; font-size: 1.1rem; margin: 1.5rem 0 0.75rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                 gap: 1rem; margin-bottom: 1.75rem; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px;
                 padding: 1.1rem 1.25rem; }
    .stat-card .value { font-size: 1.8rem; font-weight: 700; color: #f1f5f9; line-height: 1.1; }
    .stat-card .label { font-size: 0.75rem; color: #64748b; margin-top: 0.3rem;
                        text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; background: #1e293b;
            border: 1px solid #334155; border-radius: 8px; overflow: hidden; }
    thead th { background: #0f172a; color: #64748b; font-size: 0.72rem;
               text-transform: uppercase; letter-spacing: 0.06em;
               padding: 0.6rem 1rem; text-align: left; }
    tbody td { padding: 0.65rem 1rem; border-top: 1px solid #334155; vertical-align: middle; }
    tbody tr:hover td { background: #162032; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px;
             font-size: 0.72rem; font-weight: 500; }
    .badge-gray   { background: #334155; color: #94a3b8; }
    .badge-green  { background: #14532d; color: #86efac; }
    .badge-yellow { background: #422006; color: #fde68a; }
    .badge-red    { background: #450a0a; color: #fca5a5; }
    .btn { display: inline-block; padding: 0.3rem 0.7rem; border-radius: 4px;
           font-size: 0.8rem; border: none; cursor: pointer; font-family: inherit; }
    .btn-red  { background: #dc2626; color: #fff; }
    .btn-red:hover { background: #b91c1c; }
    .btn-blue { background: #2563eb; color: #fff; }
    .btn-blue:hover { background: #1d4ed8; }
    .btn-gray { background: #334155; color: #e2e8f0; }
    .btn-gray:hover { background: #475569; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px;
            padding: 1.25rem; margin-bottom: 1rem; }
    .dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.5rem;
          align-items: baseline; }
    .dl dt { color: #64748b; font-size: 0.8rem; text-transform: uppercase;
             letter-spacing: 0.05em; white-space: nowrap; }
    .dl dd { color: #e2e8f0; }
    .alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
    .alert-warn { background: #431407; border: 1px solid #78350f; color: #fed7aa; }
    .empty { color: #475569; font-style: italic; padding: 1rem; }
    .doc-type { font-size: 0.72rem; font-weight: 500; padding: 0.1rem 0.45rem;
                border-radius: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
    .type-scene     { background: #1e3a5f; color: #93c5fd; }
    .type-chapter   { background: #1a2f1e; color: #86efac; }
    .type-folder    { background: #2d2a14; color: #fde68a; }
    .type-character { background: #2a1a2f; color: #d8b4fe; }
    .type-research  { background: #1a2a2f; color: #67e8f9; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">Open Tome Admin</span>
    ${navHtml}
    <span class="logout">
      <form action="/admin/logout" method="POST" style="display:inline">
        <button type="submit">Logout</button>
      </form>
    </span>
  </nav>
  <main>
    <h1>${escHtml(title)}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`;
}

import { escHtml } from './layout.js';

export function loginView({ error }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
           background: #0f172a; color: #cbd5e1;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            padding: 2rem; width: 100%; max-width: 360px; }
    h1 { color: #f1f5f9; font-size: 1.2rem; margin-bottom: 0.4rem; }
    .sub { color: #64748b; font-size: 0.8rem; margin-bottom: 1.5rem; }
    label { display: block; color: #94a3b8; font-size: 0.8rem;
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    input[type="password"] {
      width: 100%; padding: 0.55rem 0.75rem; border-radius: 5px;
      border: 1px solid #334155; background: #0f172a; color: #f1f5f9;
      font-size: 14px; outline: none; margin-bottom: 1rem;
    }
    input[type="password"]:focus { border-color: #3b82f6; }
    button { width: 100%; padding: 0.6rem; border-radius: 5px; border: none;
             background: #2563eb; color: #fff; font-size: 14px;
             cursor: pointer; font-family: inherit; }
    button:hover { background: #1d4ed8; }
    .error { background: #450a0a; border: 1px solid #7f1d1d; color: #fca5a5;
             border-radius: 5px; padding: 0.6rem 0.75rem; margin-bottom: 1rem;
             font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Open Tome Admin</h1>
    <p class="sub">SSH-tunnel access only</p>
    ${error ? `<div class="error">${escHtml(error)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autofocus autocomplete="current-password">
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

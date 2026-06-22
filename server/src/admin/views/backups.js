import { layout, escHtml, formatDate, formatBytes } from './layout.js';

export function backupsView({ files, error, path }) {
  let body;

  if (error) {
    body = `
      <div class="alert alert-warn">${escHtml(error)}</div>
      <div class="card">
        <p style="color:#94a3b8;margin-bottom:0.75rem">To enable backup listing, add the following to the <strong>backend</strong> service in <code>docker-compose.yml</code>:</p>
        <pre style="background:#0f172a;padding:0.75rem;border-radius:5px;font-size:0.8rem;color:#86efac;overflow-x:auto">    volumes:
      - backup-data:/backups:ro</pre>
        <p style="color:#94a3b8;margin-top:0.75rem">Then redeploy with <code>docker compose up -d backend</code>.</p>
      </div>`;
  } else if (!files || files.length === 0) {
    body = `<p class="empty">No backup files found in <code>/backups</code>. The backup service may not have run yet.</p>`;
  } else {
    const rows = files.map(f => `
      <tr>
        <td style="font-family:monospace;font-size:0.82rem">${escHtml(f.name)}</td>
        <td>${formatBytes(f.size)}</td>
        <td>${formatDate(f.mtime)}</td>
      </tr>`).join('');

    body = `
      <p style="color:#64748b;margin-bottom:1rem;font-size:0.85rem">
        ${files.length} backup file${files.length !== 1 ? 's' : ''} — newest first.
        To restore: <code>docker exec -i &lt;postgres-container&gt; psql -U open_tome open_tome &lt; /backups/&lt;filename&gt;</code>
      </p>
      <table>
        <thead><tr><th>Filename</th><th>Size</th><th>Created</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  return layout('Backups', body, { currentPath: path });
}

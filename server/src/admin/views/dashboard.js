import { layout, escHtml, formatNumber } from './layout.js';

export function dashboardView({ stats, newUsers, topWriters, dbSize, path }) {
  const cards = [
    { value: formatNumber(stats.total_users),     label: 'Total Users'     },
    { value: formatNumber(stats.total_projects),  label: 'Total Projects'  },
    { value: formatNumber(stats.total_documents), label: 'Total Documents' },
    { value: formatNumber(stats.total_words),     label: 'Words Written'   },
    { value: formatNumber(newUsers),              label: 'New Users (30d)' },
    { value: escHtml(dbSize),                     label: 'Database Size'   },
  ].map(({ value, label }) => `
    <div class="stat-card">
      <div class="value">${value}</div>
      <div class="label">${label}</div>
    </div>`).join('');

  const writersRows = topWriters.length
    ? topWriters.map(u => `
      <tr>
        <td><a href="/admin/users/${escHtml(u.id)}">${escHtml(u.display_name || '(no name)')}</a></td>
        <td>${escHtml(u.email || '—')}</td>
        <td>${formatNumber(u.words_this_year)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty">No writing activity this year</td></tr>`;

  const body = `
    <div class="stat-grid">${cards}</div>
    <h2>Top Writers This Year</h2>
    <table>
      <thead><tr><th>User</th><th>Email</th><th>Words (YTD)</th></tr></thead>
      <tbody>${writersRows}</tbody>
    </table>`;

  return layout('Dashboard', body, { currentPath: path });
}

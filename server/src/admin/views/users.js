import { layout, escHtml, jsStrAttr, formatDate, formatNumber } from './layout.js';

export function usersListView({ users, path, _csrf }) {
  const rows = users.length
    ? users.map(u => `
      <tr>
        <td><a href="/admin/users/${escHtml(u.id)}">${escHtml(u.display_name || '(no name)')}</a></td>
        <td>${escHtml(u.email || '—')}</td>
        <td>${u.is_admin ? '<span class="badge badge-gray">Admin</span>' : ''}</td>
        <td>${u.project_count}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>${formatDate(u.last_login_at)}</td>
        <td><a href="/admin/users/${escHtml(u.id)}" class="btn btn-gray">View</a></td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">No users found</td></tr>`;

  const body = `
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Role</th>
          <th>Projects</th><th>Created</th><th>Last Login</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return layout(`Users (${users.length})`, body, { currentPath: path });
}

export function userDetailView({ user, totalWords, projects, path, csrf }) {
  const projectRows = projects.length
    ? projects.map(p => `
      <tr>
        <td>
          <a href="/admin/projects/${p.id}">${escHtml(p.title)}</a>
          ${p.archived ? ' <span class="badge badge-yellow">Archived</span>' : ''}
        </td>
        <td>${p.doc_count}</td>
        <td>${formatNumber(p.word_count)}</td>
        <td>${formatDate(p.updated_at)}</td>
        <td>
          <form method="POST" action="/admin/projects/${p.id}/delete"
                onsubmit="return confirm(${jsStrAttr(`Delete project "${p.title}"? This cannot be undone.`)})">
            <input type="hidden" name="_csrf" value="${escHtml(csrf)}">
            <button type="submit" class="btn btn-red">Delete</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty">No projects</td></tr>`;

  const body = `
    <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1.5rem;flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:280px">
        <dl class="dl">
          <dt>Name</dt>    <dd>${escHtml(user.display_name || '—')}</dd>
          <dt>Email</dt>   <dd>${escHtml(user.email || '—')}</dd>
          <dt>Role</dt>    <dd>${user.is_admin ? '<span class="badge badge-gray">Admin</span>' : 'User'}</dd>
          <dt>User ID</dt> <dd style="font-family:monospace;font-size:0.8rem">${escHtml(user.id)}</dd>
          <dt>Created</dt> <dd>${formatDate(user.created_at)}</dd>
          <dt>Last Login</dt><dd>${formatDate(user.last_login_at)}</dd>
          <dt>Total Words</dt><dd>${formatNumber(totalWords)}</dd>
        </dl>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;padding-top:0.25rem">
        <form method="POST" action="/admin/users/${escHtml(user.id)}/delete"
              onsubmit="return confirm(${jsStrAttr(`Permanently delete user ${user.display_name || user.id} and ALL their data?`)})">
          <input type="hidden" name="_csrf" value="${escHtml(csrf)}">
          <button type="submit" class="btn btn-red">Delete User</button>
        </form>
      </div>
    </div>

    <h2>Projects (${projects.length})</h2>
    <table>
      <thead>
        <tr><th>Title</th><th>Docs</th><th>Words</th><th>Updated</th><th></th></tr>
      </thead>
      <tbody>${projectRows}</tbody>
    </table>`;

  return layout(`User: ${user.display_name || user.id}`, body, { currentPath: path });
}

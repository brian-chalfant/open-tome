import { layout, escHtml, formatDate, formatNumber } from './layout.js';

export function projectsListView({ projects, path, csrf }) {
  const rows = projects.length
    ? projects.map(p => `
      <tr>
        <td>
          <a href="/admin/projects/${p.id}">${escHtml(p.title)}</a>
          ${p.archived ? ' <span class="badge badge-yellow">Archived</span>' : ''}
        </td>
        <td>
          <a href="/admin/users/${escHtml(p.user_id)}">${escHtml(p.user_email || p.user_name || '—')}</a>
        </td>
        <td>${p.doc_count}</td>
        <td>${formatNumber(p.word_count)}</td>
        <td>${formatDate(p.created_at)}</td>
        <td>
          <form method="POST" action="/admin/projects/${p.id}/delete"
                onsubmit="return confirm('Delete project &quot;${escHtml(p.title)}&quot;? This cannot be undone.')">
            <input type="hidden" name="_csrf" value="${escHtml(csrf)}">
            <button type="submit" class="btn btn-red">Delete</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">No projects found</td></tr>`;

  const body = `
    <table>
      <thead>
        <tr>
          <th>Title</th><th>Owner</th><th>Docs</th><th>Words</th><th>Created</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return layout(`Projects (${projects.length})`, body, { currentPath: path });
}

const TYPE_LABELS = {
  scene:     'scene',
  chapter:   'chapter',
  folder:    'folder',
  character: 'character',
  research:  'research',
};

export function projectDetailView({ project, documents, path, csrf }) {
  const docRows = documents.length
    ? documents.map(d => `
      <tr>
        <td style="padding-left:${d.parent_id ? '2rem' : '1rem'}">
          ${escHtml(d.title || 'Untitled')}
        </td>
        <td>
          <span class="doc-type type-${escHtml(d.type)}">${escHtml(TYPE_LABELS[d.type] ?? d.type)}</span>
        </td>
        <td>${formatNumber(d.word_count)}</td>
        <td>${formatDate(d.updated_at)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty">No documents</td></tr>`;

  const archivedBadge = project.archived
    ? ' <span class="badge badge-yellow">Archived</span>' : '';

  const body = `
    <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1.5rem;flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:280px">
        <dl class="dl">
          <dt>Title</dt>  <dd>${escHtml(project.title)}${archivedBadge}</dd>
          <dt>Owner</dt>  <dd><a href="/admin/users/${escHtml(project.user_id)}">${escHtml(project.user_email || project.user_name || project.user_id)}</a></dd>
          <dt>ID</dt>     <dd style="font-family:monospace">${project.id}</dd>
          <dt>Created</dt><dd>${formatDate(project.created_at)}</dd>
          <dt>Updated</dt><dd>${formatDate(project.updated_at)}</dd>
          ${project.target_words ? `<dt>Target</dt><dd>${formatNumber(project.target_words)} words</dd>` : ''}
          ${project.deadline ? `<dt>Deadline</dt><dd>${escHtml(String(project.deadline).slice(0, 10))}</dd>` : ''}
        </dl>
      </div>
      <div style="padding-top:0.25rem">
        <form method="POST" action="/admin/projects/${project.id}/delete"
              onsubmit="return confirm('Delete project &quot;${escHtml(project.title)}&quot; and all its documents? This cannot be undone.')">
          <input type="hidden" name="_csrf" value="${escHtml(csrf)}">
          <button type="submit" class="btn btn-red">Delete Project</button>
        </form>
      </div>
    </div>

    <h2>Documents (${documents.length})</h2>
    <table>
      <thead><tr><th>Title</th><th>Type</th><th>Words</th><th>Updated</th></tr></thead>
      <tbody>${docRows}</tbody>
    </table>`;

  return layout(`Project: ${project.title}`, body, { currentPath: path });
}

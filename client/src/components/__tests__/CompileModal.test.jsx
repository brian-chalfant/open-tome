import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── dnd-kit mocks — layout APIs not available in jsdom ───────────────────────

vi.mock('@dnd-kit/core', () => ({
  DndContext:     ({ children }) => <>{children}</>,
  PointerSensor:  class {},
  KeyboardSensor: class {},
  useSensor:      () => ({}),
  useSensors:     () => [],
  closestCenter:  null,
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext:             ({ children }) => <>{children}</>,
  sortableKeyboardCoordinates: null,
  verticalListSortingStrategy: null,
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: () => {},
    transform: null, transition: null, isDragging: false,
  }),
  arrayMove: (arr, from, to) => {
    const r = [...arr];
    r.splice(to, 0, r.splice(from, 1)[0]);
    return r;
  },
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

vi.mock('../../store/binderStore.js', () => ({ useBinderStore: vi.fn() }));
vi.mock('../../api/axios.js', () => ({ default: { post: vi.fn() } }));

import { useBinderStore } from '../../store/binderStore.js';
import CompileModal from '../CompileModal.jsx';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FOLDER  = { id: 1, parent_id: null, title: 'Chapter 1', type: 'folder', sort_order: 0 };
const SCENE_A = { id: 2, parent_id: 1,    title: 'Scene A',   type: 'scene',  sort_order: 0 };
const SCENE_B = { id: 3, parent_id: 1,    title: 'Scene B',   type: 'scene',  sort_order: 1 };
const SCENE_C = { id: 4, parent_id: null, title: 'Preface',   type: 'scene',  sort_order: 1 };

function setupStore(docs) {
  useBinderStore.mockImplementation((selector) => selector({ documents: docs }));
}

const onClose = vi.fn();
function renderModal() {
  render(<CompileModal projectId={42} onClose={onClose} />);
}

// ── Helper: ordered remove-button titles from the right export panel ──────────
// Returns the accessible names of all remove buttons in DOM order,
// which mirrors the exportOrder array.
function exportPanelOrder() {
  return screen
    .getAllByRole('button', { name: /Remove .* from export/i })
    .map((btn) => btn.getAttribute('aria-label').replace(/^Remove | from export$/g, ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStore([FOLDER, SCENE_A, SCENE_B, SCENE_C]);
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CompileModal — rendering', () => {
  it('renders a checkbox for each scene document', () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: 'Scene A' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Scene B' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Preface' })).toBeInTheDocument();
  });

  it('renders a group checkbox for each folder', () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: 'Chapter 1' })).toBeInTheDocument();
  });

  it('all scenes are checked by default (initial exportOrder = all scenes)', () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: 'Scene A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Scene B' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preface' })).toBeChecked();
  });

  it('shows a remove button for every scene in the initial export order', () => {
    renderModal();
    expect(
      screen.getAllByRole('button', { name: /Remove .* from export/i }),
    ).toHaveLength(3);
  });

  it('renders the Export order panel heading', () => {
    renderModal();
    expect(screen.getByText('Export order')).toBeInTheDocument();
  });
});

// ── toggleDoc ─────────────────────────────────────────────────────────────────

describe('CompileModal — toggleDoc', () => {
  it('unchecking a scene removes it from the export-order panel', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    expect(
      screen.queryByRole('button', { name: /Remove Scene A from export/i }),
    ).not.toBeInTheDocument();
  });

  it('re-checking a scene adds it back to the export-order panel', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    expect(
      screen.getByRole('button', { name: /Remove Scene A from export/i }),
    ).toBeInTheDocument();
  });

  it('re-added scene is appended to the END — drag order is preserved', async () => {
    // Initial order: A(2), B(3), C(4). Uncheck A → [B, C]. Recheck A → [B, C, A].
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    expect(exportPanelOrder()).toEqual(['Scene B', 'Preface', 'Scene A']);
  });
});

// ── toggleGroup ───────────────────────────────────────────────────────────────

describe('CompileModal — toggleGroup', () => {
  it('checking the group checkbox when all are unchecked adds all folder scenes', async () => {
    const user = userEvent.setup();
    renderModal();
    // Uncheck both folder scenes
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scene B' }));
    // Click the folder group checkbox to re-add them
    await user.click(screen.getByRole('checkbox', { name: 'Chapter 1' }));
    expect(
      screen.getByRole('button', { name: /Remove Scene A from export/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Remove Scene B from export/i }),
    ).toBeInTheDocument();
  });

  it('clicking the group checkbox when all scenes are checked removes them all', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Chapter 1' }));
    expect(
      screen.queryByRole('button', { name: /Remove Scene A from export/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove Scene B from export/i }),
    ).not.toBeInTheDocument();
  });

  it('group toggle appends folder scenes AFTER existing items — drag order preserved', async () => {
    // Initial order: A(2), B(3), C(4). Uncheck A and B → [C].
    // Click group checkbox → toAdd = [A, B] → new order = [C, A, B].
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scene B' }));
    await user.click(screen.getByRole('checkbox', { name: 'Chapter 1' }));
    expect(exportPanelOrder()).toEqual(['Preface', 'Scene A', 'Scene B']);
  });

  it('shows indeterminate state on the group checkbox when only some children are checked', async () => {
    const user = userEvent.setup();
    renderModal();
    // Uncheck Scene A — Scene B remains checked → partial selection
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    const folderCb = screen.getByRole('checkbox', { name: 'Chapter 1' });
    expect(folderCb).toHaveProperty('indeterminate', true);
  });
});

// ── Export button state ───────────────────────────────────────────────────────

describe('CompileModal — export button state', () => {
  it('export button is disabled when no documents are selected', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Scene A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scene B' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preface' }));
    expect(screen.getByRole('button', { name: /^Export /i })).toBeDisabled();
  });

  it('export button is enabled when at least one scene is selected (default state)', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^Export /i })).toBeEnabled();
  });
});

// ── Remove (×) button ─────────────────────────────────────────────────────────

describe('CompileModal — remove button', () => {
  it('clicking × removes the item from the export-order panel', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /Remove Scene A from export/i }));
    expect(
      screen.queryByRole('button', { name: /Remove Scene A from export/i }),
    ).not.toBeInTheDocument();
  });

  it('removing an item from the panel also unchecks its checkbox in the left tree', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /Remove Scene A from export/i }));
    expect(screen.getByRole('checkbox', { name: 'Scene A' })).not.toBeChecked();
  });
});

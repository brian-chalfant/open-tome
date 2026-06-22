import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── dnd-kit mocks — layout APIs not available in jsdom ───────────────────────

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor:  () => ({}),
  useSensors: () => [],
  closestCenter: null,
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <>{children}</>,
  rectSortingStrategy: null,
  sortableKeyboardCoordinates: null,
  arrayMove: (arr, from, to) => {
    const r = [...arr];
    r.splice(to, 0, r.splice(from, 1)[0]);
    return r;
  },
}));

// Stub IndexCard to isolate CorkboardView from its own dnd-kit dependency
vi.mock('../IndexCard.jsx', () => ({
  default: ({ doc }) => <div data-testid="index-card">{doc.title}</div>,
}));

vi.mock('../../store/binderStore.js', () => ({ useBinderStore: vi.fn() }));
vi.mock('../../hooks/useBinder.js',   () => ({ useBinder: vi.fn() }));

import { useBinderStore } from '../../store/binderStore.js';
import { useBinder }       from '../../hooks/useBinder.js';
import CorkboardView        from '../CorkboardView.jsx';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const FOLDER = { id: 10, parent_id: null, title: 'Act I',   type: 'folder', sort_order: 0 };
const SCENE1 = { id: 11, parent_id: 10,   title: 'Scene 1', type: 'scene',  sort_order: 0 };
const SCENE2 = { id: 12, parent_id: 10,   title: 'Scene 2', type: 'scene',  sort_order: 1 };

const mockSetActiveDoc  = vi.fn();
const mockNewDocument   = vi.fn();
const mockBulkReorder   = vi.fn();

function setupStore(docs, activeDocId = 10) {
  useBinderStore.mockImplementation((selector) =>
    selector({ documents: docs, activeDocId, setActiveDoc: mockSetActiveDoc }),
  );
  useBinder.mockReturnValue({
    labels: [], statuses: [],
    newDocument: mockNewDocument,
    bulkReorder: mockBulkReorder,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStore([FOLDER, SCENE1, SCENE2]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CorkboardView', () => {
  it('renders a card for each direct child of the active folder', () => {
    render(<CorkboardView />);
    expect(screen.getAllByTestId('index-card')).toHaveLength(2);
    expect(screen.getByText('Scene 1')).toBeInTheDocument();
    expect(screen.getByText('Scene 2')).toBeInTheDocument();
  });

  it('does not render cards for documents that are not direct children', () => {
    const SUBFOLDER = { id: 20, parent_id: 10, title: 'Sub', type: 'folder', sort_order: 2 };
    const GRANDCHILD = { id: 21, parent_id: 20, title: 'Deep Scene', type: 'scene', sort_order: 0 };
    setupStore([FOLDER, SUBFOLDER, GRANDCHILD]);
    render(<CorkboardView />);
    // Only SUBFOLDER is a direct child — grandchild should not appear
    expect(screen.getAllByTestId('index-card')).toHaveLength(1);
    expect(screen.queryByText('Deep Scene')).not.toBeInTheDocument();
  });

  it('shows Add Chapter ghost card for a top-level (root) folder with no children', () => {
    setupStore([FOLDER]); // FOLDER has parent_id: null → root context
    render(<CorkboardView />);
    expect(screen.getByRole('button', { name: /^Add chapter$/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId('index-card')).toHaveLength(0);
  });

  it('shows the quad ghost card when inside a nested (non-root) folder', () => {
    const PARENT = { id: 5,  parent_id: null, title: 'Act I',   type: 'folder', sort_order: 0 };
    const NESTED = { id: 10, parent_id: 5,    title: 'Part 1',  type: 'folder', sort_order: 0 };
    setupStore([PARENT, NESTED], 10);
    render(<CorkboardView />);
    expect(screen.getByRole('group', { name: /Add item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Scene/i })).toBeInTheDocument();
  });

  it('calls binder.newDocument("chapter", folderId) when the toolbar Add Chapter button is clicked', async () => {
    const user = userEvent.setup();
    setupStore([FOLDER]); // top-level folder → Add Chapter context
    render(<CorkboardView />);
    await user.click(screen.getByRole('button', { name: /\+ Add Chapter/i }));
    expect(mockNewDocument).toHaveBeenCalledOnce();
    expect(mockNewDocument).toHaveBeenCalledWith('chapter', 10);
  });

  it('renders the active folder title in the breadcrumb', () => {
    render(<CorkboardView />);
    expect(screen.getByText('Act I')).toBeInTheDocument();
  });

  it('renders ancestor breadcrumb entries for a nested folder', () => {
    const CHILD = { id: 20, parent_id: 10, title: 'Part Two', type: 'folder', sort_order: 0 };
    setupStore([FOLDER, CHILD], 20);
    render(<CorkboardView />);
    // Parent and child both appear in the breadcrumb nav
    expect(screen.getByText('Act I')).toBeInTheDocument();
    expect(screen.getByText('Part Two')).toBeInTheDocument();
  });

  it('calls setActiveDoc when a breadcrumb ancestor button is clicked', async () => {
    const user = userEvent.setup();
    const CHILD = { id: 20, parent_id: 10, title: 'Part Two', type: 'folder', sort_order: 0 };
    setupStore([FOLDER, CHILD], 20);
    render(<CorkboardView />);

    // "Act I" is a non-current crumb — clicking it navigates up
    await user.click(screen.getByRole('button', { name: 'Act I' }));
    expect(mockSetActiveDoc).toHaveBeenCalledWith(10);
  });
});

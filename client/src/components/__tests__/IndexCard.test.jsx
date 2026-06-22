import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── dnd-kit mocks ─────────────────────────────────────────────────────────────

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes:  {},
    listeners:   {},
    setNodeRef:  () => {},
    transform:   null,
    transition:  null,
    isDragging:  false,
  }),
}));

// Stub LabelStatusPicker — we're not testing the picker UI here
vi.mock('../LabelStatusPicker.jsx', () => ({ default: () => null }));

vi.mock('../../store/binderStore.js', () => ({ useBinderStore: vi.fn() }));
vi.mock('../../hooks/useBinder.js',   () => ({ useBinder: vi.fn() }));

import { useBinderStore } from '../../store/binderStore.js';
import { useBinder }       from '../../hooks/useBinder.js';
import IndexCard            from '../IndexCard.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockSetActiveDoc = vi.fn();
const mockRenDocument  = vi.fn();
const mockPatchDocument = vi.fn();
const mockSetDocLabel  = vi.fn();
const mockSetDocStatus = vi.fn();

const STATUS_DRAFT = { id: 1, name: 'Draft', color: '#aaa' };

function setupMocks({ labels = [], statuses = [] } = {}) {
  useBinderStore.mockImplementation((selector) =>
    selector({ setActiveDoc: mockSetActiveDoc }),
  );
  useBinder.mockReturnValue({
    labels,
    statuses,
    activeProjectId: 99,
    renDocument:  mockRenDocument,
    patchDocument: mockPatchDocument,
    setDocLabel:  mockSetDocLabel,
    setDocStatus: mockSetDocStatus,
    newLabel:  vi.fn(),
    newStatus: vi.fn(),
  });
}

function makeDoc(overrides = {}) {
  return {
    id: 1, title: 'Opening Scene', type: 'scene',
    synopsis: '', word_count: 0,
    label_id: null, status_id: null,
    parent_id: null, sort_order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

// ── Render ────────────────────────────────────────────────────────────────────

describe('IndexCard — rendering', () => {
  it('displays the document title', () => {
    render(<IndexCard doc={makeDoc({ title: 'The Call to Adventure' })} />);
    expect(screen.getByText('The Call to Adventure')).toBeInTheDocument();
  });

  it('shows "—" when word count is zero', () => {
    render(<IndexCard doc={makeDoc({ word_count: 0 })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows formatted word count when greater than zero', () => {
    render(<IndexCard doc={makeDoc({ word_count: 1234 })} />);
    expect(screen.getByText('1,234 words')).toBeInTheDocument();
  });

  it('renders the synopsis in the textarea', () => {
    render(<IndexCard doc={makeDoc({ synopsis: 'The hero wakes up.' })} />);
    expect(screen.getByRole('textbox', { name: /synopsis/i })).toHaveValue('The hero wakes up.');
  });

  it('shows "No status" badge when status_id is null', () => {
    render(<IndexCard doc={makeDoc({ status_id: null })} />);
    expect(screen.getByRole('button', { name: /no status/i })).toBeInTheDocument();
  });

  it('shows the status name when status_id matches a status', () => {
    setupMocks({ statuses: [STATUS_DRAFT] });
    render(<IndexCard doc={makeDoc({ status_id: 1 })} />);
    expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
  });

  it('renders a folder icon prefix for folder-type documents', () => {
    render(<IndexCard doc={makeDoc({ type: 'folder', title: 'Part One' })} />);
    expect(screen.getByText('Part One')).toBeInTheDocument();
    // The folder icon span is aria-hidden — check the card has the folder class
    expect(screen.getByText('Part One').closest('.index-card')).toHaveClass('index-card--folder');
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('IndexCard — title editing', () => {
  it('entering edit mode: double-clicking the title shows an input', async () => {
    const user = userEvent.setup();
    render(<IndexCard doc={makeDoc({ title: 'Before' })} />);

    await user.dblClick(screen.getByText('Before'));
    expect(screen.getByRole('textbox', { name: /edit title/i })).toBeInTheDocument();
  });

  it('pressing Escape reverts to the original title without saving', async () => {
    const user = userEvent.setup();
    render(<IndexCard doc={makeDoc({ title: 'Original' })} />);

    await user.dblClick(screen.getByText('Original'));
    const input = screen.getByRole('textbox', { name: /edit title/i });
    await user.clear(input);
    await user.type(input, 'Edited');
    await user.keyboard('{Escape}');

    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(mockRenDocument).not.toHaveBeenCalled();
  });

  it('pressing Enter commits a changed title via renDocument', async () => {
    const user = userEvent.setup();
    render(<IndexCard doc={makeDoc({ title: 'Old Title' })} />);

    await user.dblClick(screen.getByText('Old Title'));
    const input = screen.getByRole('textbox', { name: /edit title/i });
    await user.clear(input);
    await user.type(input, 'New Title');
    await user.keyboard('{Enter}');

    expect(mockRenDocument).toHaveBeenCalledWith(1, 'New Title');
  });
});

describe('IndexCard — synopsis blur-save', () => {
  it('calls patchDocument with updated synopsis on blur', async () => {
    const user = userEvent.setup();
    render(<IndexCard doc={makeDoc({ synopsis: '' })} />);

    const textarea = screen.getByRole('textbox', { name: /synopsis/i });
    await user.click(textarea);
    await user.type(textarea, 'A new synopsis.');
    await user.tab(); // triggers blur

    expect(mockPatchDocument).toHaveBeenCalledWith(1, { synopsis: 'A new synopsis.' });
  });

  it('does not call patchDocument when synopsis is unchanged on blur', async () => {
    const user = userEvent.setup();
    render(<IndexCard doc={makeDoc({ synopsis: 'Unchanged.' })} />);

    const textarea = screen.getByRole('textbox', { name: /synopsis/i });
    await user.click(textarea);
    await user.tab();

    expect(mockPatchDocument).not.toHaveBeenCalled();
  });
});

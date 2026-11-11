import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeometricField } from '@/lib/fieldData';

const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(undefined), prepare: vi.fn(), generate: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'performance-test-owner' } }) }));
vi.mock('@/lib/narratorStore', () => ({ loadNarrator: vi.fn().mockResolvedValue(null), saveNarrator: mocks.save }));
vi.mock('@/lib/fieldImport', () => ({ parseFieldImport: JSON.parse }));
vi.mock('@/lib/narratorClient', () => ({ generateNarration: mocks.generate }));
vi.mock('@/lib/narrator', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/narrator')>();
  return { ...original, prepareNarrator: (...args: Parameters<typeof original.prepareNarrator>) => {
    mocks.prepare(); return original.prepareNarrator(...args);
  } };
});
import NarratorDialog from '@/components/NarratorDialog';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function openManyFields() {
  const { container } = render(<NarratorDialog />);
  fireEvent.click(screen.getByRole('button', { name: /Re-ingest/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Välj fält' })).toBeEnabled());
  const files = Array.from({ length: 12 }, (_, f) => {
    const units = Array.from({ length: 100 }, (_, n) => ({ id: `${f}-${n}`, text: `Technical decisions require testing concrete assumptions and hidden alternatives in source ${f} node ${n}.`, fz: 0.7, fy: 0.6, cti: 0.4, clusterId: 0, vector2d: [n, 0], pos: { x: n, y: 0 }, type: 'paragraph' }));
    const field = { units, clusters: [], edges: units.slice(1).map((u, n) => ({ source: units[n].id, target: u.id, similarity: 0.8 })) } as unknown as GeometricField;
    return { name: `field-${f}.json`, size: 1000, text: async () => JSON.stringify(field) };
  });
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('Missing file input');
  fireEvent.change(input, { target: { files } });
  await waitFor(() => expect(screen.getByText('12 filer · 1200 noder')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Förbered urval' }));
  return container;
}

describe('Narrator repeated-update performance', () => {
  it('does not reselect loaded fields on each answer edit', async () => {
    await openManyFields();
    const selections = mocks.prepare.mock.calls.length;
    for (let i = 0; i < 20; i++) fireEvent.change(screen.getByRole('textbox', { name: 'Dispositionellt svar' }), { target: { value: `Edited grounded answer ${i}` } });
    expect(mocks.prepare.mock.calls.length).toBe(selections);
    expect(screen.getByRole('textbox', { name: 'Dispositionellt svar' })).toHaveValue('Edited grounded answer 19');
  });

  it('coalesces streamed draft saves but flushes the latest draft when the page hides', async () => {
    await openManyFields();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)); });
    mocks.save.mockClear();
    const selections = mocks.prepare.mock.calls.length;
    mocks.generate.mockImplementation(async (_score, _signal, onText) => {
      for (let i = 0; i < 10; i++) {
        onText(`Grounded streaming answer ${i}`);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      return 'Completed grounded answer';
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'AI-tak' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Förbered urval' }));
    fireEvent.click(screen.getByRole('button', { name: /Generera/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Dispositionellt svar' })).toHaveValue('Completed grounded answer'));
    expect(mocks.prepare.mock.calls.length).toBe(selections);
    expect(mocks.save.mock.calls.length).toBeLessThanOrEqual(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Dispositionellt svar' }), { target: { value: 'Latest reviewed draft' } });
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(mocks.save.mock.calls.at(-1)?.[1].items[0].answer).toBe('Latest reviewed draft');
    expect(mocks.save.mock.calls.at(-1)?.[0]).toBe('performance-test-owner');
  });
});
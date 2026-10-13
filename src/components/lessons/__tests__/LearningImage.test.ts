import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  viewport: { scrollTo: vi.fn() },
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
  },
  useRef: () => ({ current: hooks.viewport }),
}));
import { LearningImage } from '../LearningImage';

type Element = ReactElement<{
  children?: ReactNode;
  src?: string;
  alt?: string;
  className?: string;
  disabled?: boolean;
  style?: { width?: string; height?: string };
  onClick?: () => void;
  onLoad?: () => void;
  onError?: () => void;
  'aria-label'?: string;
  tabIndex?: number;
}>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
const image = { src: '/private-image?token=signed', alt: 'Labels for the parts of a cell', caption: 'Explore the cell.' };
function render() { hooks.index = 0; return elements(LearningImage(image)); }
function button(label: string) { return render().find(element => element.props['aria-label'] === label || element.props.children === label)!; }

beforeEach(() => {
  hooks.slots = []; hooks.index = 0; hooks.viewport.scrollTo.mockClear();
});

describe('responsive learning images', () => {
  it('retains the signed image, alternative text and caption in a contained inline view', () => {
    const tree = render();
    const images = tree.filter(element => element.type === 'img');
    expect(images).toHaveLength(2);
    for (const element of images) {
      expect(element.props.src).toBe(image.src);
      expect(element.props.alt).toBe(image.alt);
      expect(element.props.className).toContain('object-contain');
    }
    expect(images[0].props.className).toContain('h-auto');
    expect(tree.find(element => element.type === 'figcaption')?.props.children).toBe(image.caption);
    expect(button('Expand learning image')).toBeDefined();
  });

  it('bounds zoom and returns a scrolled detail view to the full image', () => {
    expect(button('Zoom out').props.disabled).toBe(true);
    button('Zoom in').props.onClick?.();
    expect(render().find(element => element.props.style)?.props.style).toEqual({ width: '150%', height: '150%' });
    for (let index = 0; index < 10; index++) button('Zoom in').props.onClick?.();
    expect(button('Zoom in').props.disabled).toBe(true);
    expect(render().find(element => element.props.style)?.props.style).toEqual({ width: '400%', height: '400%' });
    button('Fit').props.onClick?.();
    expect(render().find(element => element.props.style)?.props.style).toEqual({ width: '100%', height: '100%' });
    expect(hooks.viewport.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0 });
    for (let index = 0; index < 10; index++) button('Zoom out').props.onClick?.();
    expect(button('Zoom out').props.disabled).toBe(true);
    expect(render().find(element => element.props.tabIndex === 0)?.props.className).toContain('overflow-auto');
  });

  it('keeps load tracking and load failures with the owning resource', () => {
    const onLoad = vi.fn(); const onError = vi.fn();
    hooks.index = 0;
    const images = elements(LearningImage({ ...image, onLoad, onError })).filter(element => element.type === 'img');
    images[0].props.onLoad?.();
    expect(onLoad).toHaveBeenCalledOnce();
    expect(images[1].props.onLoad).toBeUndefined();
    images[1].props.onError?.();
    expect(onError).toHaveBeenCalledOnce();
  });
});

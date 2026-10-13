import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hookHarness, settleHook } from '@/hooks/__tests__/hookHarness';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import OrgApiKeysTab from '@/app/learn/org/[orgId]/components/OrgApiKeysTab';

const axios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: axios }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  ...await import('@/hooks/__tests__/hookHarness').then(({ hookHarness: hooks }) => ({
    useState: hooks.useState,
    useEffect: hooks.useEffect,
  })),
}));

type Element = { type: unknown; props: Record<string, any> };
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = find(child, predicate);
      if (result) return result;
    }
  } else if (isValidElement<Record<string, any>>(node)) {
    const element = node as Element;
    if (predicate(element)) return element;
    return find(element.props.children, predicate);
  }
  return undefined;
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Record<string, any>>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

function createForm() {
  const onError = vi.fn();
  const render = () => hookHarness.render(() => OrgApiKeysTab({
    organizationId: 'org-1',
    isOwnerOrAdmin: true,
    onError,
    onSuccess: vi.fn(),
  }));
  let tree = render();
  const rerender = () => { tree = render(); return tree; };
  const button = (label: string) => find(tree, node => node.type === Button && text(node.props.children) === label)!;
  const input = (id: string) => find(tree, node => node.props.id === id)!;
  const setInput = (id: string, value: string) => {
    input(id).props.onChange({ target: { value } });
    rerender();
  };
  button('Create New Key').props.onClick();
  rerender();
  setInput('api-key-name', 'Demo');
  return { onError, rerender, button, input, setInput, tree: () => tree };
}

describe('organization API-key domain feedback', () => {
  beforeEach(() => {
    hookHarness.reset();
    vi.clearAllMocks();
    axios.get.mockResolvedValue({ data: { apiKeys: [] } });
    axios.post.mockResolvedValue({ data: { apiKey: { id: 'key-1', api_key: 'isk_test' } } });
  });

  it('shows an actionable domain error inside the open dialog before making a request', async () => {
    const form = createForm();
    await settleHook();
    form.setInput('api-key-domains', 'https://example.com');
    await form.button('Create Key').props.onClick();
    form.rerender();

    const dialog = find(form.tree(), node => node.type === Dialog)!;
    const content = find(dialog.props.children, node => node.type === DialogContent)!;
    const alert = find(content.props.children, node => node.props.role === 'alert');
    expect(dialog.props.open).toBe(true);
    expect(alert).toBeDefined();
    expect(text(alert!.props.children)).toMatch(/allowed domains.*hostnames/i);
    expect(form.input('api-key-domains').props['aria-invalid']).toBe(true);
    expect(form.input('api-key-domains').props['aria-describedby']).toBe(alert!.props.id);
    expect(axios.post).not.toHaveBeenCalled();
    expect(form.onError).not.toHaveBeenCalled();
  });

  it('clears the visible error when corrected and submits canonical hosts', async () => {
    const form = createForm();
    await settleHook();
    form.setInput('api-key-domains', 'localhost:3000');
    await form.button('Create Key').props.onClick();
    form.rerender();
    expect(find(form.tree(), node => node.props.role === 'alert')).toBeDefined();

    form.setInput('api-key-domains', ' LOCALHOST, INSYTE.VERCEL.APP ');
    expect(find(form.tree(), node => node.props.role === 'alert')).toBeUndefined();
    expect(form.input('api-key-domains').props['aria-invalid']).toBeFalsy();
    await form.button('Create Key').props.onClick();
    form.rerender();

    expect(axios.post).toHaveBeenCalledWith('/api/embed/keys', expect.objectContaining({
      organization_id: 'org-1',
      allowed_domains: ['localhost', 'insyte.vercel.app'],
    }));
    expect(find(form.tree(), node => node.type === Dialog)!.props.open).toBe(false);
  });

  it('clears a dismissed error before reopening the form', async () => {
    const form = createForm();
    await settleHook();
    form.setInput('api-key-domains', 'bad host.example');
    await form.button('Create Key').props.onClick();
    form.rerender();
    expect(find(form.tree(), node => node.props.role === 'alert')).toBeDefined();

    find(form.tree(), node => node.type === Dialog)!.props.onOpenChange(false);
    form.rerender();
    form.button('Create New Key').props.onClick();
    form.rerender();
    expect(find(form.tree(), node => node.props.role === 'alert')).toBeUndefined();
  });
});

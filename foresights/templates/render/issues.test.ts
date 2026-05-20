// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps, Issue, Product } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { renderRfcs, rfcStatus } from './issues';

const FROZEN_NOW = (): Date => new Date('2026-05-19T12:00:00');

const buildDeps = (): Deps => ({
  callTool: vi.fn(),
  askClaude: vi.fn(),
  runScheduledTask: vi.fn(),
  storage: createInMemoryStorage(),
  now: FROZEN_NOW,
  document: window.document,
  window,
});

const setupDom = (): void => {
  document.body.innerHTML = '<div id="rfcs-body"></div>';
};

const sampleIssue = (overrides: Partial<Issue> = {}): Issue => ({
  number: 123,
  title: 'Sample RFC',
  body: '',
  html_url: 'https://github.com/aws/aws-cdk-rfcs/issues/123',
  labels: [],
  updated_at: '2026-05-10T10:00:00Z',
  ...overrides,
});

describe('rfcStatus', () => {
  it('returns "unlabeled" + slate class when no status label is present', () => {
    expect(rfcStatus([])).toEqual({ name: 'unlabeled', cls: 'badge-slate' });
    expect(rfcStatus([{ name: 'kind/bug' }])).toEqual({ name: 'unlabeled', cls: 'badge-slate' });
  });

  it('maps done / approved / implementing → green', () => {
    expect(rfcStatus([{ name: 'status/done' }]).cls).toBe('badge-green');
    expect(rfcStatus([{ name: 'status/approved' }]).cls).toBe('badge-green');
    expect(rfcStatus([{ name: 'status/implementing' }]).cls).toBe('badge-green');
  });

  it('maps review / final-comment / api-approved / planning → amber', () => {
    expect(rfcStatus([{ name: 'status/final-comment' }]).cls).toBe('badge-amber');
    expect(rfcStatus([{ name: 'status/review' }]).cls).toBe('badge-amber');
    expect(rfcStatus([{ name: 'status/api-approved' }]).cls).toBe('badge-amber');
    expect(rfcStatus([{ name: 'status/planning' }]).cls).toBe('badge-amber');
  });

  it('maps proposed → purple', () => {
    expect(rfcStatus([{ name: 'status/proposed' }]).cls).toBe('badge-purple');
  });

  it('falls back to slate for unrecognised status values', () => {
    expect(rfcStatus([{ name: 'status/something-new' }]).cls).toBe('badge-slate');
  });

  it('strips the "status/" prefix from the displayed name', () => {
    expect(rfcStatus([{ name: 'status/final-comment' }]).name).toBe('final-comment');
  });

  it('accepts plain-string labels (GitHub list-issues sometimes returns strings)', () => {
    expect(rfcStatus(['status/done'])).toEqual({ name: 'done', cls: 'badge-green' });
  });

  it('handles null/undefined labels gracefully', () => {
    expect(rfcStatus(undefined as unknown as Issue['labels'])).toEqual({
      name: 'unlabeled',
      cls: 'badge-slate',
    });
  });
});

describe('renderRfcs', () => {
  beforeEach(() => {
    setupDom();
  });

  it('renders an error card when the issue list is empty', () => {
    renderRfcs(buildDeps(), [], 'rfcs', []);
    expect(document.getElementById('rfcs-body')?.querySelector('.err')).not.toBeNull();
  });

  it('is a no-op when the target container is missing', () => {
    document.body.innerHTML = '';
    expect(() => renderRfcs(buildDeps(), [sampleIssue({ labels: [] })], 'rfcs', [])).not.toThrow();
  });

  it('renders the title prefixed with # number and links to the issue', () => {
    renderRfcs(
      buildDeps(),
      [sampleIssue({ number: 42, title: 'Better RFC labels', labels: [] })],
      'rfcs',
      [],
    );
    const titleLink = document.querySelector('.card-title a');
    expect(titleLink?.textContent).toBe('#42 — Better RFC labels');
    expect(titleLink?.getAttribute('href')).toBe(sampleIssue({}).html_url);
  });

  it('renders the status badge with the correct class', () => {
    renderRfcs(
      buildDeps(),
      [sampleIssue({ labels: [{ name: 'status/implementing' }] })],
      'rfcs',
      [],
    );
    const badge = document.querySelector('.badge.badge-green');
    expect(badge?.textContent).toBe('implementing');
  });

  it('caps at 8 issues', () => {
    const lots: Issue[] = Array.from({ length: 12 }, (_, i) =>
      sampleIssue({ number: 100 + i, title: `RFC ${i}` }),
    );
    renderRfcs(buildDeps(), lots, 'rfcs', []);
    expect(document.querySelectorAll('#rfcs-body > .card').length).toBe(8);
  });

  it('matches title + body against products and renders flag badges', () => {
    const product: Product = {
      id: 'fakeprod',
      label: 'FakeProd',
      cssMod: 'fp',
      match: (text) => (text.includes('webhook') ? 'mentions webhook' : null),
    };
    renderRfcs(
      buildDeps(),
      [sampleIssue({ title: 'Add native webhook', body: 'Body without the keyword' })],
      'rfcs',
      [product],
    );
    const badge = document.querySelector('.insights-tag');
    expect(badge?.getAttribute('data-product-id')).toBe('fakeprod');
    expect(badge?.getAttribute('title')).toBe('mentions webhook · click for full brief');
    expect(badge?.classList.contains('expandable')).toBe(true);
    expect(badge?.getAttribute('data-kind')).toBe('rfc');
  });

  it('escapes title text to prevent HTML injection', () => {
    renderRfcs(buildDeps(), [sampleIssue({ title: '<script>alert(1)</script>' })], 'rfcs', []);
    const title = document.querySelector('.card-title');
    expect(title?.innerHTML).toContain('&lt;script&gt;');
    expect(title?.querySelector('script')).toBeNull();
  });

  it('uses the section param to choose the target container', () => {
    document.body.innerHTML = '<div id="rfcs-body"></div><div id="my-issues-body"></div>';
    renderRfcs(buildDeps(), [sampleIssue({})], 'my-issues', []);
    expect(document.getElementById('rfcs-body')?.innerHTML).toBe('');
    expect(document.getElementById('my-issues-body')?.innerHTML).toContain('card-title');
  });
});

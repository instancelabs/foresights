import { describe, expect, it } from 'vitest';
import { stressTestProductRegexes } from './validate-regexes';

describe('stressTestProductRegexes — clean inputs', () => {
  it('returns no warnings / no failures for fast regexes', () => {
    const report = stressTestProductRegexes({
      products: [
        {
          id: 'cdki',
          rules: [
            { source: 'cdk[- ]?insights', flags: 'i' },
            { source: '\\bnag\\b', flags: 'i' },
          ],
        },
      ],
    });
    expect(report.warnings).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.results).toHaveLength(2);
    expect(report.results[0]?.worstMs).toBeLessThan(50);
  });

  it('returns an empty report for an empty config', () => {
    const r = stressTestProductRegexes({});
    expect(r.results).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.failures).toEqual([]);
  });

  it('returns an empty report for a product with no rules', () => {
    const r = stressTestProductRegexes({
      products: [{ id: 'cdki', rules: [] }],
    });
    expect(r.results).toEqual([]);
  });
});

describe('stressTestProductRegexes — bad inputs', () => {
  it('surfaces invalid regex source as a failure', () => {
    const r = stressTestProductRegexes({
      products: [{ id: 'cdki', rules: [{ source: '[unclosed', flags: '' }] }],
    });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/invalid-regex/);
    expect(r.failures[0]).toMatch(/cdki/);
  });

  it('surfaces invalid regex flags as a failure', () => {
    const r = stressTestProductRegexes({
      products: [{ id: 'cdki', rules: [{ source: 'foo', flags: 'XX' }] }],
    });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/invalid-regex/);
  });

  it('continues past a bad rule to test the rest', () => {
    const r = stressTestProductRegexes({
      products: [
        {
          id: 'cdki',
          rules: [{ source: '[unclosed' }, { source: 'fine', flags: 'i' }],
        },
      ],
    });
    expect(r.failures).toHaveLength(1);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.source).toBe('fine');
  });
});

describe('stressTestProductRegexes — threshold detection', () => {
  // Real catastrophic-backtracking patterns are surprisingly hard to
  // detect deterministically — V8 has optimised many of them away, and
  // the timing is platform-dependent. Rather than try to construct a
  // truly slow regex, we verify the threshold-detection logic
  // mechanically by stubbing Date.now to simulate elapsed time. That
  // checks the warning + failure plumbing without flaking on a fast CI
  // runner.
  it('emits a build failure when elapsed time crosses the catastrophic threshold', () => {
    const realNow = Date.now;
    let calls = 0;
    // Each (start, end) pair represents one regex.test() invocation; the
    // stress corpus has 3 entries, so each rule sees 3 pairs. Return
    // (0, 1500) for the first body and (0, 0) for the rest — that's a
    // 1500ms worst case, well above CATASTROPHIC_THRESHOLD_MS (1000).
    Date.now = () => {
      const n = calls++;
      if (n === 0) return 0;
      if (n === 1) return 1500;
      return 0;
    };
    try {
      const r = stressTestProductRegexes({
        products: [
          {
            id: 'evil',
            rules: [{ source: 'fine', flags: '' }],
          },
        ],
      });
      expect(r.failures).toHaveLength(1);
      expect(r.failures[0]).toMatch(/slow-regex/);
      expect(r.failures[0]).toMatch(/evil/);
      expect(r.results[0]?.worstMs).toBe(1500);
    } finally {
      Date.now = realNow;
    }
  });

  it('emits a build warning when elapsed time crosses the slow threshold', () => {
    const realNow = Date.now;
    let calls = 0;
    Date.now = () => {
      const n = calls++;
      if (n === 0) return 0;
      if (n === 1) return 200;
      return 0;
    };
    try {
      const r = stressTestProductRegexes({
        products: [{ id: 'p', rules: [{ source: 'fine', flags: '' }] }],
      });
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/slow-regex/);
      expect(r.failures).toHaveLength(0);
    } finally {
      Date.now = realNow;
    }
  });
});

'use strict';

const { generatePayload } = require('../../src/services/payloadGenerator');

describe('payloadGenerator', () => {
  it('produces a well-shaped payload', () => {
    const p = generatePayload();
    expect(typeof p.id).toBe('string');
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof p.eventType).toBe('string');
    expect(Number.isInteger(p.sequence)).toBe(true);
    expect(Array.isArray(p.tags)).toBe(true);
    expect(p.metrics).toEqual(
      expect.objectContaining({
        value: expect.any(Number),
        latencyMs: expect.any(Number),
        success: expect.any(Boolean),
      })
    );
    expect(() => new Date(p.clientTimestamp).toISOString()).not.toThrow();
  });

  it('is serializable to JSON without loss', () => {
    const p = generatePayload();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('generates distinct payloads across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePayload().id));
    // UUIDs collide with negligible probability; 50 unique ids expected.
    expect(ids.size).toBe(50);
  });

  it('keeps tags within bounds and unique', () => {
    for (let i = 0; i < 20; i += 1) {
      const { tags } = generatePayload();
      expect(tags.length).toBeLessThanOrEqual(3);
      expect(new Set(tags).size).toBe(tags.length);
    }
  });
});

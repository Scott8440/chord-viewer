// The scale-degree circle's layout (pure parts; the pings are DOM animation).
import { describe, expect, it } from "vitest";
import { degreeCircleSvg, degreePoint } from "../src/views/degreeCircle";

describe("degree circle", () => {
  it("puts 1 at the top and the octave on the same node", () => {
    const one = degreePoint(0);
    expect(one.x).toBeCloseTo(150);
    expect(one.y).toBeLessThan(150);
    expect(degreePoint(12)).toEqual(one);
  });

  it("goes clockwise, with notes outside the scale halfway between their neighbours", () => {
    expect(degreePoint(2).x).toBeGreaterThan(150);   // 2 is right of the top
    const [two, flatThree, three] = [2, 3, 4].map(degreePoint);
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist(flatThree, two)).toBeCloseTo(dist(flatThree, three));
    expect(dist(flatThree, two)).toBeGreaterThan(10);
  });

  it("draws all seven degrees, solid only where on offer, and never a note name", () => {
    const svg = degreeCircleSvg(["1", "5"]);
    expect(svg.match(/class="node/g)).toHaveLength(7);
    expect(svg.match(/class="node on"/g)).toHaveLength(2);
    expect(svg).toContain('data-semitones="7"');
    expect(svg).not.toMatch(/[A-G][♯♭#b]?</);
  });
});

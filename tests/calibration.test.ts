// Tap-along latency calibration.
import { describe, expect, it } from "vitest";
import { addTap, CALIBRATION_TAPS, CALIBRATION_WARMUP, calibrationResult, measured, startCalibration } from "../src/timing/calibration";
import { startTransport } from "../src/timing/transport";

/** 120 BPM from t = 0: beats every 500 ms */
const transport = startTransport(120, 4, 0);
const tapAll = (offsets: number[]) => offsets.reduce((c, o, i) => addTap(c, transport, 500 * (i + 1) + o), startCalibration());
const warmup = Array(CALIBRATION_WARMUP).fill(-200);   // wild at first: ignored

describe("calibration", () => {
  it("needs the warm-up and then every measured tap", () => {
    expect(calibrationResult(tapAll([...warmup, ...Array(CALIBRATION_TAPS - 1).fill(-30)]))).toBeNull();
  });

  it("takes the median distance from the beat: rushing gives a negative latency", () => {
    const r = calibrationResult(tapAll([...warmup, -30, -35, -28, -32, -40, -25, -30, -31, -29, -33, -30, -27]));
    expect(r).toEqual({ latencyMs: -30, spreadMs: 2, steady: true });
  });

  it("ignores stray taps", () => {
    const c = tapAll([...warmup, 20, 22, 240, 18, 21, 19, 20, 23, 17, 20, 21, 22, 20]);
    expect(measured(c)).toHaveLength(CALIBRATION_TAPS);
    expect(calibrationResult(c)!.latencyMs).toBe(20);
  });

  it("flags taps too scattered to trust", () => {
    const r = calibrationResult(tapAll([...warmup, -80, 40, -60, 70, -10, 90, -100, 30, 0, -70, 60, -40]));
    expect(r!.steady).toBe(false);
  });
});

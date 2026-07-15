import { afterEach, beforeEach, describe, it } from "vitest";
import {
  atomicAdapterCases,
  type AtomicAdapterHarness
} from "./atomic-adapter-cases.js";

export type { AtomicAdapterHarness } from "./atomic-adapter-cases.js";

export function describeAtomicAdapterConformance(
  adapterName: string,
  createHarness: () => Promise<AtomicAdapterHarness>
): void {
  describe(`${adapterName} atomic adapter conformance`, () => {
    let harness: AtomicAdapterHarness | undefined;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness?.close();
      harness = undefined;
    });

    for (const testCase of atomicAdapterCases) {
      it(testCase.name, async () => {
        await testCase.run(requireHarness(harness));
      });
    }
  });
}

function requireHarness(
  harness: AtomicAdapterHarness | undefined
): AtomicAdapterHarness {
  if (!harness) {
    throw new Error("Atomic adapter harness is not initialized");
  }
  return harness;
}

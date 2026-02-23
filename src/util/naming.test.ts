import { describe, it, expect } from "vitest";
import { formatOutputName } from "./naming.js";

describe("formatOutputName", () => {
  it("replaces {id} and {seed}", () => {
    expect(
      formatOutputName("{id}-{seed}", {
        id: "my-sketch",
        seed: 42,
        index: 0,
        params: {},
        format: "png",
      }),
    ).toBe("my-sketch-42.png");
  });

  it("replaces {index} with zero-padded value", () => {
    expect(
      formatOutputName("{id}-{index}", {
        id: "sketch",
        seed: 1,
        index: 7,
        params: {},
        format: "jpeg",
      }),
    ).toBe("sketch-0007.jpeg");
  });

  it("replaces {params} with key=value pairs", () => {
    expect(
      formatOutputName("{id}-{params}", {
        id: "sketch",
        seed: 1,
        index: 0,
        params: { amp: 0.5, freq: 3 },
        format: "png",
      }),
    ).toBe("sketch-amp=0.5_freq=3.png");
  });

  it("uses 'default' when params is empty", () => {
    expect(
      formatOutputName("{id}-{params}", {
        id: "sketch",
        seed: 1,
        index: 0,
        params: {},
        format: "png",
      }),
    ).toBe("sketch-default.png");
  });
});

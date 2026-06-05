import assert from "node:assert";
import { describe, it } from "node:test";
import { legacyDemoApiEnabled } from "./legacy-demo-guard";
import { GET as getLegacyDb } from "./db/route";

describe("legacy demo API guard", () => {
  it("keeps legacy web demo APIs disabled by default", () => {
    assert.strictEqual(legacyDemoApiEnabled({}), false);
  });

  it("allows legacy web demo APIs only when explicitly enabled", () => {
    assert.strictEqual(
      legacyDemoApiEnabled({ ENABLE_LEGACY_WEB_DEMO_API: "true" }),
      true,
    );
    assert.strictEqual(
      legacyDemoApiEnabled({ ENABLE_LEGACY_WEB_DEMO_API: "false" }),
      false,
    );
  });

  it("returns 404 for the legacy mock database route by default", async () => {
    const previous = process.env.ENABLE_LEGACY_WEB_DEMO_API;
    delete process.env.ENABLE_LEGACY_WEB_DEMO_API;
    try {
      const response = await getLegacyDb();
      assert.strictEqual(response.status, 404);
      assert.deepStrictEqual(await response.json(), {
        error: "Legacy demo API is disabled",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.ENABLE_LEGACY_WEB_DEMO_API;
      } else {
        process.env.ENABLE_LEGACY_WEB_DEMO_API = previous;
      }
    }
  });
});

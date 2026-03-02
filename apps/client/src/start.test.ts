import assert from "node:assert/strict";
import test from "node:test";

import { resolveStartReconciliationProfile } from "./start.ts";

test("start reconciliation profile prefers explicit reconciliationProfile option", () => {
  const profile = resolveStartReconciliationProfile(
    {
      reconciliationProfile: "jitter",
      networkProfile: "clean",
    },
    "?networkProfile=loss_5pct&reconciliationProfile=clean",
  );

  assert.equal(profile, "jitter");
});

test("start reconciliation profile falls back to networkProfile option", () => {
  const profile = resolveStartReconciliationProfile(
    {
      networkProfile: "loss_5pct",
    },
    "?networkProfile=clean",
  );

  assert.equal(profile, "loss_5pct");
});

test("start reconciliation profile supports query-string profile selection", () => {
  const profile = resolveStartReconciliationProfile({}, "?networkProfile=jitter");
  assert.equal(profile, "jitter");

  const explicitParam = resolveStartReconciliationProfile({}, "?reconciliationProfile=loss_5pct");
  assert.equal(explicitParam, "loss_5pct");
});

test("start reconciliation profile defaults to clean for unknown or missing values", () => {
  assert.equal(resolveStartReconciliationProfile({}, "?networkProfile=unknown"), "clean");
  assert.equal(resolveStartReconciliationProfile({}, ""), "clean");
});

# Runtime Constants (G0 Freeze)

Status: FROZEN_FOR_MVP
EffectiveDate: 2026-02-28
Owner: WS-A-001

## Contract

```yaml
runtimeConstants:
  tickRateHz: 120
  snapshotRateHz: 20
  inputRateHz: 60
  maxSubsteps: 8
  reconcileThresholdCm: 20
```

## Rationale

| constant | rationale |
|---|---|
| tickRateHz = 120 | Matches fixed-step simulation already implemented in `packages/sim`; provides stable physics granularity for wall/ceiling transitions. |
| snapshotRateHz = 20 | Keeps bandwidth and server fanout predictable while still supporting client interpolation between snapshots. |
| inputRateHz = 60 | Matches common client frame cadence and keeps control latency low without doubling input packet volume. |
| maxSubsteps = 8 | Matches current accumulator cap in simulation to prevent spiral-of-death under frame spikes. |
| reconcileThresholdCm = 20 | Aligns correction trigger with release SLO target (`p95 <= 20cm`) to avoid over-correcting micro-error noise. |

## MVP Immutability Note

These values are immutable for MVP.

Allowed changes before post-MVP only:
- Fixing clear production defects that block playability.
- Changes approved in a single contract review covering client, server, sim, and protocol together.

If changed post-MVP planning, bump docs revision and update all dependent packages in one atomic PR.

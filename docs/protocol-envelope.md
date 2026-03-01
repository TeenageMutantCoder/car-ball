# Protocol Envelope (G0 Freeze)

Status: FROZEN_FOR_MVP
EffectiveDate: 2026-02-28
Owner: WS-B-001

## Envelope Contract

```yaml
envelope:
  requiredFields:
    version:
      type: integer
      description: Protocol schema version.
      constraints:
        - must equal local supported version
    sequence:
      type: integer
      description: Monotonic message counter per sender stream.
      constraints:
        - starts at 1 on connection/session start
        - must not decrease within a stream
    timestamp:
      type: integer
      unit: ms
      description: Sender wall-clock Unix time in milliseconds.
      constraints:
        - must be present on every message
```

## Compatibility Policy

```yaml
compatibilityPolicy:
  strategy: exact_version_match_for_mvp
  acceptWhen:
    - envelope.version == localProtocolVersion
  rejectWhen:
    - envelope.version != localProtocolVersion
  rejectionCode: VERSION_MISMATCH
  notes:
    - Do not attempt cross-version coercion during MVP.
    - Version mismatch is a hard failure for message decode.
```

## Additive Change Policy

```yaml
additiveChangePolicy:
  envelopeFields:
    - Envelope field set is frozen for MVP: [version, sequence, timestamp]
    - Do not remove, rename, repurpose, or change units/types.
  payloadFields:
    - Additive fields must be optional at introduction.
    - Existing required fields keep semantics and units.
    - Unknown optional fields should be safely ignorable by consumers.
  versioning:
    - Any non-additive payload change requires protocol version bump.
    - Any envelope change requires protocol version bump and contract review.
```

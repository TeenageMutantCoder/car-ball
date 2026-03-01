# Entity ID and Ownership Semantics (G0 Freeze)

Status: FROZEN_FOR_MVP
EffectiveDate: 2026-02-28
Owner: WS-A-002

## Canonical ID Formats

```yaml
idFormats:
  playerId:
    canonical: "player-<slug>"
    regex: "^player-[a-z0-9]+(?:-[a-z0-9]+)*$"
    examples: ["player-1", "player-stevonw"]
  carId:
    canonical: "car:<playerId>"
    regex: "^car:player-[a-z0-9]+(?:-[a-z0-9]+)*$"
    examples: ["car:player-1"]
  ballId:
    canonical: "ball:main"
    regex: "^ball:main$"
    examples: ["ball:main"]
  teamId:
    canonical: "team:<side>"
    allowedSides: ["blue", "orange"]
    regex: "^team:(blue|orange)$"
    examples: ["team:blue", "team:orange"]
  goalId:
    canonical: "goal:<side>"
    allowedSides: ["blue", "orange"]
    regex: "^goal:(blue|orange)$"
    examples: ["goal:blue", "goal:orange"]
  matchId:
    canonical: "match-<slug>"
    regex: "^match-[a-z0-9]+(?:-[a-z0-9]+)*$"
    examples: ["match-local-1", "match-ranked-42"]
```

## Ownership Rules

```yaml
ownershipRules:
  playerOwnsCar:
    rule: "Each playerId owns exactly one carId for a match."
    mapping: "carId == 'car:' + playerId"
    cardinality:
      playerToCar: "1:1"
      carToPlayer: "1:1"
  ballOwnership:
    rule: "No player owns the ball. Ball is simulation-owned."
  teamMembership:
    rule: "Each playerId and carId belongs to exactly one teamId in a match."
  goalOwnership:
    rule: "Each goalId is static world metadata bound to a team side, not a player-owned entity."
  matchScope:
    rule: "All IDs are unique within a match; matchId scopes all entity sets."
```

## Authority Expectations

```yaml
authority:
  protocol:
    clientMaySend:
      - "client.input for its own (playerId, carId) pair"
      - "client.ready for its own playerId"
      - "client.ping"
    clientMustNotSend:
      - "input claiming another player's playerId"
      - "input claiming a carId not mapped to its playerId"
  sim:
    sourceOfTruth:
      - "car state"
      - "ball state"
      - "tick advancement"
      - "scoring/phase transitions"
  server:
    enforces:
      - "session -> playerId binding"
      - "playerId -> carId mapping"
      - "team/goal metadata consistency"
      - "snapshot emission from authoritative sim state"
```

## Lifecycle Transitions

```yaml
lifecycle:
  player:
    - state: "connected"
    - state: "assigned_player_id"
    - state: "assigned_team"
    - state: "ready"
    - state: "in_match"
    - state: "disconnected"
  car:
    - state: "created_on_match_start"
    - state: "owned_by_player"
    - state: "active"
    - state: "despawned_on_match_end"
  ball:
    - state: "spawned_as_ball:main_on_match_start"
    - state: "active"
    - state: "reset_after_goal"
    - state: "despawned_on_match_end"
  team_and_goal:
    - state: "created_as_static_match_metadata"
    - state: "unchanged_during_match"
    - state: "released_on_match_end"
  transferPolicy:
    ownershipTransferAllowed: false
    notes:
      - "No car ownership transfers during MVP."
      - "Rejoin restores original playerId/carId mapping if session is resumed."
```

## Validation Rules

```yaml
validation:
  idShape:
    - "Reject messages with IDs that fail canonical regex."
  inputFrame:
    - "Require playerId and carId on every client.input."
    - "Reject when carId != 'car:' + playerId."
    - "Reject when session-bound playerId != frame.playerId."
  snapshot:
    - "Require exactly one ball with id=ball:main."
    - "Require unique car IDs in cars[]."
    - "Require every car.ownerPlayerId references a known playerId in match scope."
    - "Require every car.teamId is one of team:blue or team:orange."
  matchState:
    - "Require non-empty matchId with canonical format."
    - "Require scoreByTeam keys align to known team IDs."
  errorHandling:
    onViolation: "server.error(code=BAD_MESSAGE) and drop offending message"
```

## Cross-Package Mapping

```yaml
crossPackageMapping:
  protocol:
    file: "packages/protocol/src/contracts.ts"
    fields:
      - "PlayerId"
      - "CarId"
      - "BallId"
      - "TeamId"
      - "GoalId"
      - "MatchId"
      - "InputFrame.playerId"
      - "InputFrame.carId"
      - "CarSnapshot.ownerPlayerId"
      - "CarSnapshot.teamId"
      - "BallSnapshot.id"
      - "MatchState.matchId"
  sim:
    file: "packages/sim/src/state.ts"
    fields:
      - "CarState.id (car:<playerId>)"
      - "CarState.playerId"
      - "BallState.id (ball:main)"
  server:
    file: "apps/server/src/index.ts"
    notes:
      - "Server runtime must maintain authoritative mapping and enforce validation rules in ingestion path."
```
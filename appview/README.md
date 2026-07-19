# etzhayyim-project-communicator App design

This directory defines the App migration and component boundaries for
`etzhayyim-project-communicator`.

## Planned components

1. `communicator-agent-component`
- Exposes `CommunicatorAgentService`
- Runs strategy planning, draft generation, and approval gating
- Calls emotional analytics service for tone adaptation

2. `delivery-orchestrator-component`
- Maps provider selection to adapter actions
- Uses `etzhayyim-project-mailer` for thread-level consistency
- Handles retry with fallback (gmail <-> outlook)

3. `conversation-memory-component`
- Stores conversation events, stage transitions, and pending tasks
- Supports idempotent ingest and replay recovery

4. `policy-check-component` (phase 2)
- Runs policy/risk checks prior to dispatch
- Can hard-block delivery on compliance violations

## Runtime dependencies

1. `wrpc/xrpc-provider` for service exposure
2. `performer/rdbms` (cypher graph RDBMS) for state persistence
3. `wasi:http/outgoing-handler` for adapter and analytics API calls

## Namespace rule

When creating WADM `Application` resources for this project:
- `default` namespace is forbidden
- deploy to the configured App namespace only

## Deployment shape

1. Stateless strategy components can run with 2+ replicas
2. Memory component should use deterministic key partitioning
3. Delivery orchestrator should emit auditable events for every send attempt

## Operational SLO targets

1. Draft generation p95: < 2.5s
2. Dispatch decision p95: < 800ms (without provider send latency)
3. Inbound ingest p95: < 1.2s
4. End-to-end dispatch success target: >= 99.5% with retry/fallback

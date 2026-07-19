# etzhayyim-project-communicator

`etzhayyim-project-communicator` is a communication control plane that orchestrates
external conversations through Gmail/Outlook while keeping a consistent agent
decision layer, policy guardrails, and conversation memory.

It integrates with:
- `etzhayyim-project-mailer` for message/thread abstractions and mailbox context
- `etzhayyim-project-external-service-adapter` for provider-native execution
- `etzhayyim-project-emotional-analytics` for emotion-aware strategy adaptation

## Design goals

1. Use one agent contract for both Gmail and Outlook
2. Keep provider APIs behind adapter boundaries
3. Require approval for high-risk communication
4. Adapt tone and escalation strategy using emotional signals
5. Persist conversation state and follow-up actions as first-class objects

## High-level architecture

1. `communicator-agent-component`
- Plans communication strategy
- Produces draft candidates
- Chooses send path and approval policy

2. `delivery-orchestrator-component`
- Selects provider (`gmail` / `outlook` / `auto`)
- Sends through mailer + external-service-adapter
- Handles retry and fallback

3. `conversation-memory-component`
- Stores thread timeline and action items
- Tracks approval state, risk state, and delivery state
- Feeds context back into next agent decisions

4. `policy-check-component` (planned)
- PII, legal, regulated-domain policy checks
- Risk scoring and block/escalate decisions

## Communication flow

1. Agent receives goal (e.g., follow-up, escalation, legal notice)
2. Agent fetches recent thread from `etzhayyim-project-mailer`
3. Agent requests emotional signals from `etzhayyim-project-emotional-analytics`
4. Agent generates draft and risk score
5. If risk requires approval, move to `PENDING_APPROVAL`
6. After approval, delivery orchestrator dispatches via selected provider
7. Delivery status and inbound replies are ingested into conversation memory
8. Agent updates next action and follow-up schedule

## Agent design

### Internal decision stages

1. `INTAKE`: Normalize request and communication objective
2. `ANALYZE`: Thread summary + emotion signal ingestion
3. `STRATEGIZE`: Decide intent, tone, and channel/provider plan
4. `DRAFT`: Generate draft variants (short/standard/formal)
5. `POLICY`: Evaluate risk and approval requirement
6. `DISPATCH`: Send message and track provider response
7. `LEARN`: Store outcomes for subsequent step selection

### Required capabilities

1. Intent classification (`support`, `sales`, `incident`, `compliance`, `follow-up`)
2. Emotion-aware tone adaptation (`calm`, `assertive`, `empathetic`, `neutral`)
3. Structured fallback:
- Provider API failure: retry then alternate provider
- Token/auth failure: move to `ACTION_REQUIRED_AUTH`
- Policy failure: `BLOCKED_POLICY`

## Integration boundaries

### With etzhayyim-project-mailer

- Read thread/message history for context
- Persist outbound/inbound communication as thread events
- Reuse alias identities, templates, and mailbox metadata

### With etzhayyim-project-external-service-adapter

- Gmail tool family:
  - `gmail.mail.send`
  - `gmail.mail.reply`
  - `gmail.mail.list`
- Outlook tool family:
  - `outlook.mail.send`
  - `outlook.mail.reply`
  - `outlook.mail.list`

### With etzhayyim-project-emotional-analytics

- Analyze inbound/outbound text to get emotional vectors
- Track trend by conversation (de-escalating vs escalating)
- Return recommended response style and urgency hints

## Reliability and governance

1. Idempotency key required for every dispatch request
2. At-least-once event ingestion with dedupe key
3. Audit trail for every draft/approval/send action
4. Configurable policy profiles per tenant and domain
5. Explicit model version tracking for emotional analytics outputs

## API contract

See: `proto/v1/communicator.proto`

## App implementation plan

See: `wasm/README.md`

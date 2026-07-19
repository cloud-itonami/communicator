/**
 * communicator kotoba — cross-provider communication orchestration, maximal
 * migration via the kotoba-E2E split (ADR-2606011400 Consensys + ADR-2605172400
 * 3-axis + ADR-2605181100 kotoba E2E encrypted-record envelope). Founder
 * directive 2026-06-03: front everything that can move; only the irreducible
 * regulated EXECUTION stays etzhayyim.
 *
 * SPLIT:
 *   PUBLIC (plaintext AT records) — non-sensitive reference + read-views:
 *     - policyProfile: per-tenant communication policy config (profile name,
 *       compliance tags, blocked-term count, approval rule). Reference catalog,
 *       no person PII / message body.
 *     - conversationStageEvent: conversation lifecycle timeline (stage / risk /
 *       approval / provider enum states + next-action label). Ops facts, no PII,
 *       no message content. FK conversationId is an opaque orchestration ID.
 *
 *   SENSITIVE (kotoba E2E, com.etzhayyim.encrypted.record) — read-cap = owner
 *   DID + explicit recipients, so confidential payloads live on-substrate
 *   encrypted, never etzhayyim-resident in plaintext:
 *     - conversationParty: per-person PII (email / display name / organization /
 *       role) of a sender or recipient.
 *     - messageRecord: draft + delivery payload (subject / body / tone /
 *       rationale / provider / delivery state / external message id / retry
 *       count) plus per-person emotion analytics (VAD signals). Message body +
 *       message metadata + per-person analytics are all confidential.
 *
 *   STAYS etzhayyim (consumed via consent-capability) — the irreducible regulated
 *   EXECUTION, NOT a data collection: (1) LLM/GPU draft-generation inference,
 *   (2) the actual Gmail/Outlook SEND action (provider dispatch enforcement),
 *   (3) provider OAuth token / credential custody. The transaction DATA (drafts,
 *   delivery metadata, parties) migrates E2E; only the send-call + inference +
 *   token custody stay etzhayyim.
 *
 * AT-Lexicon: no float. Counts / retry / blocked-term-count are non-negative
 * integers. Emotion analytics: arousal / dominance / urgency / confidence are
 * integer 0-100; valence is bipolar so it is stored as a signed integer
 * -100..100 (0 = neutral).
 */

// Plaintext public collections.
export const POLICY_PROFILE_COLLECTION = "com.etzhayyim.apps.communicator.policyProfile";
export const STAGE_EVENT_COLLECTION = "com.etzhayyim.apps.communicator.conversationStageEvent";
// E2E inner-type NSIDs (body shape inside the kotoba envelope).
export const PARTY_INNER_TYPE = "com.etzhayyim.apps.communicator.conversationParty";
export const MESSAGE_INNER_TYPE = "com.etzhayyim.apps.communicator.messageRecord";

export const COMMUNICATOR_DID_PREFIX = "did:web:communicator.etzhayyim.com:" as const;

// ─── Enum string unions (mirror communicator.proto, sans UNSPECIFIED) ──────

export type ChannelType = "email";
export type ProviderType = "auto" | "gmail" | "outlook";
export type ConversationStage =
  | "intake" | "analyze" | "strategize" | "draft"
  | "pendingApproval" | "dispatched" | "waitingReply" | "closed";
export type ApprovalState = "notRequired" | "pending" | "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type DeliveryState =
  | "preparing" | "sent" | "delivered" | "failed"
  | "retrying" | "actionRequiredAuth" | "blockedPolicy";
export type PartyRole = "sender" | "recipient";
export type EmotionSignalSource = "messageBody" | "threadTrend" | "subjectLine";

export const CONVERSATION_STAGES: readonly ConversationStage[] = [
  "intake", "analyze", "strategize", "draft",
  "pendingApproval", "dispatched", "waitingReply", "closed",
];
export const APPROVAL_STATES: readonly ApprovalState[] = ["notRequired", "pending", "approved", "rejected"];
export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high", "blocked"];
export const PROVIDER_TYPES: readonly ProviderType[] = ["auto", "gmail", "outlook"];

// ─── Policy profile (PLAINTEXT, reference catalog) ──────────────────────

export interface PolicyProfileRecord {
  did: string;
  profileName: string;
  tenantId: string;
  requireApprovalForHighRisk: boolean;
  /** integer >= 0 — count only; the actual blocked terms are not stored here. */
  blockedTermCount: number;
  complianceTags: string[];
  createdAt: string;
}
export interface PolicyProfileView extends PolicyProfileRecord {
  profileUri: string;
}
export interface RegisterPolicyProfileInput {
  profileName: string;
  tenantId: string;
  requireApprovalForHighRisk: boolean;
  blockedTermCount: number;
  complianceTags?: string[];
}
export interface RegisterPolicyProfileOutput {
  status: "registered" | "alreadyExists" | "rejected";
  profileUri?: string;
  did?: string;
  profileName?: string;
  error?: string;
}
export interface GetPolicyProfileInput {
  profileName: string;
}
export interface GetPolicyProfileOutput {
  profile?: PolicyProfileView;
  error?: string;
}
export interface ListPolicyProfilesInput {
  tenantId?: string;
  limit?: number;
  cursor?: string;
}
export interface ListPolicyProfilesOutput {
  items: PolicyProfileView[];
  cursor?: string;
  total: number;
}

// ─── Conversation stage event (PLAINTEXT, ops timeline read-view) ───────

export interface StageEventRecord {
  did: string;
  eventId: string;
  conversationId: string;
  stage: ConversationStage;
  riskLevel: RiskLevel;
  approvalState: ApprovalState;
  selectedProvider: ProviderType;
  nextAction: string;
  occurredAt: string;
  createdAt: string;
}
export interface StageEventView extends StageEventRecord {
  eventUri: string;
}
export interface RecordStageEventInput {
  eventId: string;
  conversationId: string;
  stage: ConversationStage;
  riskLevel: RiskLevel;
  approvalState: ApprovalState;
  selectedProvider: ProviderType;
  nextAction?: string;
  occurredAt?: string;
}
export interface RecordStageEventOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  eventUri?: string;
  did?: string;
  eventId?: string;
  error?: string;
}
export interface ListStageEventsInput {
  conversationId?: string;
  stage?: ConversationStage;
  limit?: number;
  cursor?: string;
}
export interface ListStageEventsOutput {
  items: StageEventView[];
  cursor?: string;
  total: number;
}

// ─── Conversation party (E2E-ENCRYPTED, per-person PII) ─────────────────

export interface ConversationPartyBody {
  partyId: string;
  conversationId: string;
  role: PartyRole;
  displayName: string;
  email: string;
  organization: string;
}
export interface ConversationPartyView extends ConversationPartyBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RecordPartyInput {
  partyId: string;
  conversationId: string;
  role: PartyRole;
  displayName: string;
  email: string;
  organization?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface RecordPartyOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  partyId?: string;
  error?: string;
}
export interface ListPartiesInput {
  conversationId?: string;
  role?: PartyRole;
  limit?: number;
  cursor?: string;
}
export interface ListPartiesOutput {
  items: ConversationPartyView[];
  cursor?: string;
  total: number;
}
export interface GetPartyInput {
  partyId: string;
}
export interface GetPartyOutput {
  party?: ConversationPartyView;
  error?: string;
}

// ─── Message record (E2E-ENCRYPTED, draft + delivery + analytics) ───────

/**
 * Per-person emotion analytics. AT-Lexicon no float: arousal/dominance/
 * urgency/confidence are integer 0-100; valence is bipolar signed -100..100
 * (0 = neutral).
 */
export interface EmotionSignal {
  source: EmotionSignalSource;
  modelVersion: string;
  /** signed integer -100..100, 0 = neutral. */
  valence: number;
  /** integer 0-100. */
  arousal: number;
  /** integer 0-100. */
  dominance: number;
  /** integer 0-100. */
  urgency: number;
  /** integer 0-100. */
  confidence: number;
  emotionLabels: string[];
}
export interface MessageRecordBody {
  messageId: string;
  conversationId: string;
  subject: string;
  bodyText: string;
  toneLabel: string;
  rationale: string;
  riskLevel: RiskLevel;
  approvalState: ApprovalState;
  provider: ProviderType;
  deliveryState: DeliveryState;
  externalMessageId: string;
  /** integer >= 0. */
  retryCount: number;
  emotionSignals: EmotionSignal[];
  composedAt: string;
}
export interface MessageRecordView extends MessageRecordBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RecordMessageInput {
  messageId: string;
  conversationId: string;
  subject: string;
  bodyText: string;
  toneLabel?: string;
  rationale?: string;
  riskLevel: RiskLevel;
  approvalState: ApprovalState;
  provider: ProviderType;
  deliveryState: DeliveryState;
  externalMessageId?: string;
  retryCount?: number;
  emotionSignals?: EmotionSignal[];
  composedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface RecordMessageOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  messageId?: string;
  error?: string;
}
export interface ListMessagesInput {
  conversationId?: string;
  deliveryState?: DeliveryState;
  limit?: number;
  cursor?: string;
}
export interface ListMessagesOutput {
  items: MessageRecordView[];
  cursor?: string;
  total: number;
}
export interface GetMessageInput {
  messageId: string;
}
export interface GetMessageOutput {
  message?: MessageRecordView;
  error?: string;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  policyProfileCount?: number;
  stageEventCount?: number;
  conversationPartyCount?: number;
  messageRecordCount?: number;
  stageEventsByStage?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
/** integer 0-100. */
export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
/** signed integer -100..100 (bipolar valence). */
export function isSignedPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= -100 && n <= 100;
}
export function isProvider(v: unknown): v is ProviderType {
  return typeof v === "string" && (PROVIDER_TYPES as readonly string[]).includes(v);
}
export function isStage(v: unknown): v is ConversationStage {
  return typeof v === "string" && (CONVERSATION_STAGES as readonly string[]).includes(v);
}
export function isRisk(v: unknown): v is RiskLevel {
  return typeof v === "string" && (RISK_LEVELS as readonly string[]).includes(v);
}
export function isApproval(v: unknown): v is ApprovalState {
  return typeof v === "string" && (APPROVAL_STATES as readonly string[]).includes(v);
}
export function validateEmotionSignal(s: EmotionSignal): boolean {
  return (
    isSignedPct(s.valence) &&
    isPct(s.arousal) &&
    isPct(s.dominance) &&
    isPct(s.urgency) &&
    isPct(s.confidence)
  );
}
export function policyDidFor(name: string): string {
  return `${COMMUNICATOR_DID_PREFIX}policy:${name.toLowerCase()}`;
}
export function stageEventDidFor(id: string): string {
  return `${COMMUNICATOR_DID_PREFIX}stage:${id.toLowerCase()}`;
}
export function policyRkey(name: string): string {
  return `policy-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function stageEventRkey(id: string): string {
  return `stage-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function partyRkey(id: string): string {
  return `party-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function messageRkey(id: string): string {
  return `msg-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

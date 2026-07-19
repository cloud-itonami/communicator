/**
 * communicator kotoba — registry.
 *
 * Plaintext path (policyProfile / conversationStageEvent): sdk.write / sdk.read
 * — reference config + ops-timeline read-views, no PII / no message body.
 * E2E path (conversationParty / messageRecord): sdk.encryptedWrite /
 * sdk.encryptedRead — per-person PII + draft/delivery payload + analytics sealed
 * in the kotoba envelope (ADR-2605181100), read-cap = owner DID + recipients.
 *
 * The irreducible regulated EXECUTION (LLM/GPU draft inference, the Gmail/Outlook
 * SEND action, provider OAuth token custody) stays etzhayyim, consumed via
 * consent-capability — it is NOT represented here. Only the transaction DATA
 * fronts.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  POLICY_PROFILE_COLLECTION,
  STAGE_EVENT_COLLECTION,
  PARTY_INNER_TYPE,
  MESSAGE_INNER_TYPE,
  policyDidFor,
  stageEventDidFor,
  policyRkey,
  stageEventRkey,
  partyRkey,
  messageRkey,
  isUint,
  isProvider,
  isStage,
  isRisk,
  isApproval,
  validateEmotionSignal,
  type ConversationPartyBody,
  type ConversationPartyView,
  type CoverageInput,
  type CoverageOutput,
  type GetMessageInput,
  type GetMessageOutput,
  type GetPartyInput,
  type GetPartyOutput,
  type GetPolicyProfileInput,
  type GetPolicyProfileOutput,
  type ListMessagesInput,
  type ListMessagesOutput,
  type ListPartiesInput,
  type ListPartiesOutput,
  type ListPolicyProfilesInput,
  type ListPolicyProfilesOutput,
  type ListStageEventsInput,
  type ListStageEventsOutput,
  type MessageRecordBody,
  type MessageRecordView,
  type PolicyProfileRecord,
  type PolicyProfileView,
  type RecordMessageInput,
  type RecordMessageOutput,
  type RecordPartyInput,
  type RecordPartyOutput,
  type RecordStageEventInput,
  type RecordStageEventOutput,
  type RegisterPolicyProfileInput,
  type RegisterPolicyProfileOutput,
  type StageEventRecord,
  type StageEventView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── Policy profile (PLAINTEXT, reference catalog) ──────────────────────

export async function registerPolicyProfile(
  e: Etzhayyim,
  input: RegisterPolicyProfileInput
): Promise<RegisterPolicyProfileOutput> {
  if (!input.profileName || !input.tenantId) return { status: "rejected", error: "missingRequiredFields" };
  if (typeof input.requireApprovalForHighRisk !== "boolean") return { status: "rejected", error: "invalidApprovalRule" };
  if (!isUint(input.blockedTermCount)) return { status: "rejected", error: "invalidBlockedTermCount" };
  const rkey = policyRkey(input.profileName);
  const existing = await e
    .read<PolicyProfileRecord>({ collection: POLICY_PROFILE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      profileUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      profileName: input.profileName,
    };
  }
  const now = new Date().toISOString();
  const did = policyDidFor(input.profileName);
  const record: PolicyProfileRecord = {
    did,
    profileName: input.profileName,
    tenantId: input.tenantId,
    requireApprovalForHighRisk: input.requireApprovalForHighRisk,
    blockedTermCount: input.blockedTermCount,
    complianceTags: input.complianceTags ?? [],
    createdAt: now,
  };
  const receipt = await e.write({ collection: POLICY_PROFILE_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", profileUri: receipt.uri, did, profileName: input.profileName };
}

export async function getPolicyProfile(e: Etzhayyim, input: GetPolicyProfileInput): Promise<GetPolicyProfileOutput> {
  if (!input.profileName) return { error: "invalidProfileName" };
  const resp = await e
    .read<PolicyProfileRecord>({ collection: POLICY_PROFILE_COLLECTION, rkey: policyRkey(input.profileName) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r?.value) return { error: "notFound" };
  return { profile: { ...r.value, profileUri: r.uri } };
}

export async function listPolicyProfiles(e: Etzhayyim, input: ListPolicyProfilesInput = {}): Promise<ListPolicyProfilesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<PolicyProfileRecord>({ collection: POLICY_PROFILE_COLLECTION, cursor: input.cursor, limit });
  const items: PolicyProfileView[] = resp.records
    .filter((r) => !input.tenantId || r.value.tenantId === input.tenantId)
    .map((r) => ({ ...r.value, profileUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Conversation stage event (PLAINTEXT, ops timeline) ─────────────────

/** FK check: does a stage event with this id already exist? (read-by-rkey). */
async function stageEventExists(e: Etzhayyim, eventId: string): Promise<boolean> {
  const resp = await e
    .read<StageEventRecord>({ collection: STAGE_EVENT_COLLECTION, rkey: stageEventRkey(eventId) })
    .catch(() => ({ records: [] }));
  return Boolean(resp.records[0]?.value);
}

export async function recordStageEvent(e: Etzhayyim, input: RecordStageEventInput): Promise<RecordStageEventOutput> {
  if (!input.eventId || !input.conversationId) return { status: "rejected", error: "missingRequiredFields" };
  if (!isStage(input.stage)) return { status: "rejected", error: "invalidStage" };
  if (!isRisk(input.riskLevel)) return { status: "rejected", error: "invalidRiskLevel" };
  if (!isApproval(input.approvalState)) return { status: "rejected", error: "invalidApprovalState" };
  if (!isProvider(input.selectedProvider)) return { status: "rejected", error: "invalidProvider" };
  if (await stageEventExists(e, input.eventId)) {
    return { status: "alreadyExists", eventId: input.eventId };
  }
  const now = new Date().toISOString();
  const did = stageEventDidFor(input.eventId);
  const record: StageEventRecord = {
    did,
    eventId: input.eventId,
    conversationId: input.conversationId,
    stage: input.stage,
    riskLevel: input.riskLevel,
    approvalState: input.approvalState,
    selectedProvider: input.selectedProvider,
    nextAction: input.nextAction ?? "",
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: STAGE_EVENT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey: stageEventRkey(input.eventId) });
  return { status: "recorded", eventUri: receipt.uri, did, eventId: input.eventId };
}

export async function listStageEvents(e: Etzhayyim, input: ListStageEventsInput = {}): Promise<ListStageEventsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<StageEventRecord>({ collection: STAGE_EVENT_COLLECTION, cursor: input.cursor, limit });
  const items: StageEventView[] = resp.records
    .filter((r) => !input.conversationId || r.value.conversationId === input.conversationId)
    .filter((r) => !input.stage || r.value.stage === input.stage)
    .map((r) => ({ ...r.value, eventUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Conversation party (E2E-ENCRYPTED, per-person PII) ─────────────────

export async function recordParty(e: Etzhayyim, input: RecordPartyInput): Promise<RecordPartyOutput> {
  if (!input.partyId || !input.conversationId || !input.email || !input.displayName) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (input.role !== "sender" && input.role !== "recipient") return { status: "rejected", error: "invalidRole" };
  const body: ConversationPartyBody = {
    partyId: input.partyId,
    conversationId: input.conversationId,
    role: input.role,
    displayName: input.displayName,
    email: input.email,
    organization: input.organization ?? "",
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: PARTY_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: partyRkey(input.partyId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, partyId: input.partyId };
}

async function scanParties(e: Etzhayyim, maxScan: number): Promise<ConversationPartyView[]> {
  const out: ConversationPartyView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<ConversationPartyBody>({ innerType: PARTY_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listParties(e: Etzhayyim, input: ListPartiesInput = {}): Promise<ListPartiesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanParties(e, DEFAULT_MAX_SCAN);
  const filtered = all
    .filter((p) => !input.conversationId || p.conversationId === input.conversationId)
    .filter((p) => !input.role || p.role === input.role);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getParty(e: Etzhayyim, input: GetPartyInput): Promise<GetPartyOutput> {
  if (!input.partyId) return { error: "invalidPartyId" };
  const all = await scanParties(e, DEFAULT_MAX_SCAN);
  const found = all.find((p) => p.partyId === input.partyId);
  if (!found) return { error: "notFound" };
  return { party: found };
}

// ─── Message record (E2E-ENCRYPTED, draft + delivery + analytics) ───────

export async function recordMessage(e: Etzhayyim, input: RecordMessageInput): Promise<RecordMessageOutput> {
  if (!input.messageId || !input.conversationId || !input.subject) return { status: "rejected", error: "missingRequiredFields" };
  if (!isRisk(input.riskLevel)) return { status: "rejected", error: "invalidRiskLevel" };
  if (!isApproval(input.approvalState)) return { status: "rejected", error: "invalidApprovalState" };
  if (!isProvider(input.provider)) return { status: "rejected", error: "invalidProvider" };
  const retryCount = input.retryCount ?? 0;
  if (!isUint(retryCount)) return { status: "rejected", error: "invalidRetryCount" };
  const emotionSignals = input.emotionSignals ?? [];
  for (const s of emotionSignals) {
    if (!validateEmotionSignal(s)) return { status: "rejected", error: "invalidEmotionSignal" };
  }
  const body: MessageRecordBody = {
    messageId: input.messageId,
    conversationId: input.conversationId,
    subject: input.subject,
    bodyText: input.bodyText ?? "",
    toneLabel: input.toneLabel ?? "",
    rationale: input.rationale ?? "",
    riskLevel: input.riskLevel,
    approvalState: input.approvalState,
    provider: input.provider,
    deliveryState: input.deliveryState,
    externalMessageId: input.externalMessageId ?? "",
    retryCount,
    emotionSignals,
    composedAt: input.composedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: MESSAGE_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: messageRkey(input.messageId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, messageId: input.messageId };
}

async function scanMessages(e: Etzhayyim, maxScan: number): Promise<MessageRecordView[]> {
  const out: MessageRecordView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<MessageRecordBody>({ innerType: MESSAGE_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listMessages(e: Etzhayyim, input: ListMessagesInput = {}): Promise<ListMessagesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanMessages(e, DEFAULT_MAX_SCAN);
  const filtered = all
    .filter((m) => !input.conversationId || m.conversationId === input.conversationId)
    .filter((m) => !input.deliveryState || m.deliveryState === input.deliveryState);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getMessage(e: Etzhayyim, input: GetMessageInput): Promise<GetMessageOutput> {
  if (!input.messageId) return { error: "invalidMessageId" };
  const all = await scanMessages(e, DEFAULT_MAX_SCAN);
  const found = all.find((m) => m.messageId === input.messageId);
  if (!found) return { error: "notFound" };
  return { message: found };
}

// ─── Coverage rollup (all four collections) ─────────────────────────────

async function countCollection<T>(e: Etzhayyim, collection: string, maxScan: number): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  while (count < maxScan) {
    const page = await e.read<T>({ collection, cursor, limit: PAGE_LIMIT });
    count += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return count;
}

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);

  // Plaintext: policy profiles.
  const policyProfileCount = await countCollection<PolicyProfileRecord>(e, POLICY_PROFILE_COLLECTION, maxScan);

  // Plaintext: stage events (with by-stage rollup).
  const stageEventsByStage: Record<string, number> = {};
  let stageEventCount = 0;
  let cursor: string | undefined;
  while (stageEventCount < maxScan) {
    const page = await e.read<StageEventRecord>({ collection: STAGE_EVENT_COLLECTION, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      stageEventsByStage[r.value.stage] = (stageEventsByStage[r.value.stage] ?? 0) + 1;
      stageEventCount += 1;
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }

  // E2E: parties + messages (each innerType scanned separately).
  const conversationPartyCount = (await scanParties(e, maxScan)).length;
  const messageRecordCount = (await scanMessages(e, maxScan)).length;

  return {
    policyProfileCount,
    stageEventCount,
    conversationPartyCount,
    messageRecordCount,
    stageEventsByStage,
    truncated:
      policyProfileCount >= maxScan ||
      stageEventCount >= maxScan ||
      conversationPartyCount >= maxScan ||
      messageRecordCount >= maxScan,
  };
}

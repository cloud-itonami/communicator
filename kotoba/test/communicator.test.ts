import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerPolicyProfile,
  getPolicyProfile,
  listPolicyProfiles,
  recordStageEvent,
  listStageEvents,
  recordParty,
  listParties,
  getParty,
  recordMessage,
  listMessages,
  getMessage,
  coverage,
} from "../src/index.js";
import type { EmotionSignal } from "../src/index.js";

const OWNER = "did:web:communicator.etzhayyim.com";

const signal: EmotionSignal = {
  source: "messageBody",
  modelVersion: "ea-v3",
  valence: -40, // bipolar signed
  arousal: 70,
  dominance: 30,
  urgency: 90,
  confidence: 85,
  emotionLabels: ["frustration", "urgency"],
};

describe("communicator kotoba (kotoba-E2E split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("policyProfile (PLAINTEXT reference catalog)", () => {
    it("registers, dedups, validates, gets, lists/filters", async () => {
      expect(
        (await registerPolicyProfile(e, { profileName: "default", tenantId: "t1", requireApprovalForHighRisk: true, blockedTermCount: 12, complianceTags: ["pii", "gdpr"] })).status
      ).toBe("registered");
      expect(
        (await registerPolicyProfile(e, { profileName: "default", tenantId: "t1", requireApprovalForHighRisk: true, blockedTermCount: 12 })).status
      ).toBe("alreadyExists");
      expect(
        (await registerPolicyProfile(e, { profileName: "bad", tenantId: "t1", requireApprovalForHighRisk: true, blockedTermCount: -1 })).status
      ).toBe("rejected");
      await registerPolicyProfile(e, { profileName: "strict", tenantId: "t2", requireApprovalForHighRisk: false, blockedTermCount: 40 });
      const got = await getPolicyProfile(e, { profileName: "default" });
      expect(got.profile?.tenantId).toBe("t1");
      expect(got.profile?.complianceTags).toContain("gdpr");
      expect((await getPolicyProfile(e, { profileName: "missing" })).error).toBe("notFound");
      expect((await listPolicyProfiles(e)).total).toBe(2);
      expect((await listPolicyProfiles(e, { tenantId: "t1" })).total).toBe(1);
    });
  });

  describe("conversationStageEvent (PLAINTEXT ops timeline)", () => {
    it("records, dedups (FK by eventId), validates enums, lists/filters", async () => {
      expect(
        (await recordStageEvent(e, { eventId: "ev1", conversationId: "conv-1", stage: "draft", riskLevel: "high", approvalState: "pending", selectedProvider: "gmail", nextAction: "await-approval" })).status
      ).toBe("recorded");
      expect(
        (await recordStageEvent(e, { eventId: "ev1", conversationId: "conv-1", stage: "draft", riskLevel: "high", approvalState: "pending", selectedProvider: "gmail" })).status
      ).toBe("alreadyExists");
      expect(
        (await recordStageEvent(e, { eventId: "evX", conversationId: "conv-1", stage: "draft", riskLevel: "high", approvalState: "pending", selectedProvider: "telegram" as any })).status
      ).toBe("rejected"); // invalid provider
      expect(
        (await recordStageEvent(e, { eventId: "evY", conversationId: "conv-1", stage: "explode" as any, riskLevel: "high", approvalState: "pending", selectedProvider: "gmail" })).status
      ).toBe("rejected"); // invalid stage
      await recordStageEvent(e, { eventId: "ev2", conversationId: "conv-2", stage: "dispatched", riskLevel: "low", approvalState: "approved", selectedProvider: "outlook" });
      expect((await listStageEvents(e)).total).toBe(2);
      expect((await listStageEvents(e, { conversationId: "conv-1" })).total).toBe(1);
      expect((await listStageEvents(e, { stage: "dispatched" })).total).toBe(1);
    });
  });

  describe("conversationParty (E2E-ENCRYPTED per-person PII)", () => {
    it("seals via encryptedWrite, round-trips via encryptedRead, validates", async () => {
      const ok = await recordParty(e, { partyId: "p1", conversationId: "conv-1", role: "recipient", displayName: "Alice Tan", email: "alice@acme.example", organization: "Acme" });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      expect((await recordParty(e, { partyId: "pX", conversationId: "conv-1", role: "guest" as any, displayName: "X", email: "x@y.z" })).status).toBe("rejected"); // invalid role
      expect((await recordParty(e, { partyId: "pY", conversationId: "conv-1", role: "recipient", displayName: "Y", email: "" } as any)).status).toBe("rejected"); // missing email
      const got = await getParty(e, { partyId: "p1" });
      expect(got.party?.email).toBe("alice@acme.example");
      expect(got.party?.organization).toBe("Acme");
      await recordParty(e, { partyId: "p2", conversationId: "conv-1", role: "sender", displayName: "Bob Lee", email: "bob@etzhayyim.example" });
      await recordParty(e, { partyId: "p3", conversationId: "conv-2", role: "recipient", displayName: "Carol", email: "carol@x.example" });
      expect((await listParties(e)).total).toBe(3);
      expect((await listParties(e, { conversationId: "conv-1" })).total).toBe(2);
      expect((await listParties(e, { role: "sender" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the party", async () => {
      await recordParty(e, { partyId: "p1", conversationId: "conv-1", role: "recipient", displayName: "Alice", email: "alice@acme.example" });
      // A distinct PDS view (own empty encStore) — proving isolation by owner DID.
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listParties(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient", async () => {
      const partner = "did:web:partner.example";
      const r = await recordParty(e, { partyId: "p1", conversationId: "conv-1", role: "recipient", displayName: "Alice", email: "alice@acme.example", recipients: [partner] });
      expect(r.status).toBe("recorded");
      expect((await listParties(e)).total).toBe(1);
    });
  });

  describe("messageRecord (E2E-ENCRYPTED draft + delivery + analytics)", () => {
    it("seals draft/delivery payload, round-trips, validates risk/provider/emotion", async () => {
      const ok = await recordMessage(e, {
        messageId: "m1",
        conversationId: "conv-1",
        subject: "Re: invoice follow-up",
        bodyText: "Hi Alice, following up on the outstanding item.",
        toneLabel: "empathetic",
        rationale: "de-escalate",
        riskLevel: "medium",
        approvalState: "approved",
        provider: "gmail",
        deliveryState: "sent",
        externalMessageId: "gmail-abc123",
        retryCount: 1,
        emotionSignals: [signal],
      });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      // invalid provider
      expect((await recordMessage(e, { messageId: "mX", conversationId: "c", subject: "s", bodyText: "b", riskLevel: "low", approvalState: "approved", provider: "fax" as any, deliveryState: "sent" })).status).toBe("rejected");
      // invalid emotion signal (valence out of signed range)
      expect(
        (await recordMessage(e, { messageId: "mY", conversationId: "c", subject: "s", bodyText: "b", riskLevel: "low", approvalState: "approved", provider: "gmail", deliveryState: "sent", emotionSignals: [{ ...signal, valence: 200 }] })).status
      ).toBe("rejected");
      // invalid retry count
      expect((await recordMessage(e, { messageId: "mZ", conversationId: "c", subject: "s", bodyText: "b", riskLevel: "low", approvalState: "approved", provider: "gmail", deliveryState: "sent", retryCount: -3 })).status).toBe("rejected");
      const got = await getMessage(e, { messageId: "m1" });
      expect(got.message?.subject).toBe("Re: invoice follow-up");
      expect(got.message?.emotionSignals[0].valence).toBe(-40);
      expect(got.message?.externalMessageId).toBe("gmail-abc123");
      await recordMessage(e, { messageId: "m2", conversationId: "conv-2", subject: "Quote", bodyText: "...", riskLevel: "low", approvalState: "notRequired", provider: "outlook", deliveryState: "delivered" });
      expect((await listMessages(e)).total).toBe(2);
      expect((await listMessages(e, { conversationId: "conv-1" })).total).toBe(1);
      expect((await listMessages(e, { deliveryState: "delivered" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the message", async () => {
      await recordMessage(e, { messageId: "m1", conversationId: "conv-1", subject: "s", bodyText: "secret body", riskLevel: "low", approvalState: "approved", provider: "gmail", deliveryState: "sent" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listMessages(outsider)).total).toBe(0);
    });
  });

  describe("coverage rollup", () => {
    it("counts all four collections (2 plaintext + 2 E2E)", async () => {
      await registerPolicyProfile(e, { profileName: "default", tenantId: "t1", requireApprovalForHighRisk: true, blockedTermCount: 3 });
      await recordStageEvent(e, { eventId: "ev1", conversationId: "conv-1", stage: "draft", riskLevel: "high", approvalState: "pending", selectedProvider: "gmail" });
      await recordStageEvent(e, { eventId: "ev2", conversationId: "conv-1", stage: "draft", riskLevel: "high", approvalState: "pending", selectedProvider: "gmail" });
      await recordParty(e, { partyId: "p1", conversationId: "conv-1", role: "recipient", displayName: "Alice", email: "alice@acme.example" });
      await recordMessage(e, { messageId: "m1", conversationId: "conv-1", subject: "s", bodyText: "b", riskLevel: "low", approvalState: "approved", provider: "gmail", deliveryState: "sent" });
      const cov = await coverage(e);
      expect(cov.policyProfileCount).toBe(1);
      expect(cov.stageEventCount).toBe(2);
      expect(cov.conversationPartyCount).toBe(1);
      expect(cov.messageRecordCount).toBe(1);
      expect(cov.stageEventsByStage?.draft).toBe(2);
      expect(cov.truncated).toBe(false);
    });
  });
});

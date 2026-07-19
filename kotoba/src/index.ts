/**
 * communicator kotoba — barrel. Maximal migration via the kotoba-E2E split
 * (ADR-2605181100): policy config + conversation ops-timeline plaintext;
 * per-person PII + draft/delivery payload + emotion analytics sealed E2E.
 * The Gmail/Outlook SEND action, LLM draft inference, and provider OAuth token
 * custody stay etzhayyim, consumed via consent-capability.
 */
export * from "./types.js";
export {
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
} from "./registry.js";

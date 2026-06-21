# ADR Topic Candidates From the Weather Page

This document captures architecture decision topics distilled from the weather forecast page work. These are candidate ADRs or implementation topics, not accepted decisions.

## Strong ADR Candidates

### Treat Client-Side Preference Storage as Non-Authoritative

Scope: browser-local preference storage such as `localStorage`, last-used filters, selected coordinates, selected locale, crop, work type, and map layer.

Decision direction:

- Store user convenience settings locally when it improves the experience.
- Do not store fetched provider payloads, permissions, or business-authoritative state in browser preference storage.
- Bounded derived forecast snapshots may be stored locally when they support non-authoritative UX features such as forecast confidence, provided they are compact, validated on read, safe to discard, and never treated as source data.
- Treat locally stored settings as hints that may be missing, stale, malformed, or unavailable.
- Validate restored values against explicit supported value sets before using them.

Related ADRs:

- ADR 0018: locale handling
- ADR 0022: explicit named constants for value sets
- ADR 0034: frontend boundaries
- ADR 0035: caches and read models as derived data

### Model Advisory Forecast Rules as Transparent Heuristics

Scope: operational guidance derived from data, such as agricultural work suitability, risk scoring, recommendations, eligibility hints, and planning advice.

Decision direction:

- Mark advisory outputs as heuristic when they are not authoritative domain decisions.
- Show the reasons and input signals behind each score.
- Avoid false precision where the model only supports coarse guidance.
- Keep advisory rules separate from raw data ingestion, canonical provider mapping, and UI rendering.
- Make carry-over effects explicit when one day's conditions affect later recommendations.

This is the strongest new ADR candidate from this work because it generalises beyond weather. It applies to any product that turns uncertain input data into operational recommendations.

Related ADRs:

- ADR 0022: explicit named constants for value sets
- ADR 0028: external provider adapters
- ADR 0034: frontend boundaries
- ADR 0035: derived data

### Separate External Visual Embeds From Application Data Sources

Scope: embedded third-party visual tools such as Windy maps, charts, dashboards, radar views, or media widgets.

Decision direction:

- Treat external embeds as presentation aids unless their data is ingested through an application-owned provider adapter.
- Do not use embedded visual state as input to business calculations.
- Label visual-only embeds clearly when they are not part of the application model.
- Keep embed configuration separate from canonical provider data contracts.

Related ADRs:

- ADR 0028: external provider adapters
- ADR 0029: explicit API contracts
- ADR 0034: frontend boundaries
- ADR 0044: minimise vendor code dependencies

## Smaller Or Implementation-Level Topics

### Use Browser Capabilities as Optional Client Inputs

Scope: browser geolocation, browser locale, permission prompts, and similar client capabilities.

Decision direction:

- Use browser capabilities to initialise or suggest values.
- Require graceful degradation when a capability is missing, blocked, or denied.
- Treat browser-provided values as client input, not authoritative application state.
- Keep user-triggered permission prompts explicit.

This may fit better as implementation guidance under ADR 0034 rather than a standalone ADR.

Related ADRs:

- ADR 0018: locale handling
- ADR 0034: frontend boundaries
- ADR 0015: personal data minimisation

### Normalise Multi-Provider Forecasts Before Aggregation

Scope: forecast providers or any equivalent external providers that expose similar information with different schemas, units, timestamps, and completeness rules.

Decision direction:

- Map each provider response into one canonical internal model before aggregation.
- Normalise units, timestamps, timezone handling, missing values, provenance, and freshness metadata.
- Keep raw provider payloads available only for explicit debugging or support needs.
- Make aggregation policy explicit, such as median selection and source omission rules.

This is mostly covered by ADR 0028, so it is likely an implementation topic rather than a new ADR.

Related ADRs:

- ADR 0028: external provider adapters
- ADR 0029: explicit API contracts
- ADR 0035: derived data

## Recommended Next ADR

The best standalone ADR candidate is:

**Model Advisory Forecast Rules as Transparent Heuristics**

Reason:

It captures a pattern not fully covered by the existing ADRs: turning uncertain, incomplete, or forecast-based data into user-facing operational guidance. The key architectural point is not the weather domain itself, but the need to expose uncertainty, reasons, inputs, and limitations whenever software makes advisory recommendations.

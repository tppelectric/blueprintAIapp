# NEC 2023 Rules Module Notes

This project now isolates NEC-related workflow logic in:
- `packages/shared/src/modules/electrical-code/*`
- Architecture scaffold mirror: `backend/modules/electrical_code/*`

Current implemented logic:
- Load-calculation scaffolding (Article 220 style workflow assumptions)
- Service-size recommendation helper
- Panel schedule row generation from dedicated-circuit workflows
- Grounding recommendation helper

Manual confirmation required:
- Clause-level NEC compliance interpretation and exceptions
- Demand-factor edge cases by occupancy/use
- Final panel and conductor engineering selections for permit submittal

No NEC rules should be invented. If a rule requirement is unclear or missing, it must be confirmed with a licensed engineer/AHJ interpretation workflow.


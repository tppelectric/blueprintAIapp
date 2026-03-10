# Utility Rules Module Notes

This project now isolates utility-profile logic in:
- `packages/shared/src/modules/utility-rules/*`
- Architecture scaffold mirror: `backend/modules/utility_rules/*`

Covered utility profiles:
- Central Hudson (Blue Book 2026 profile scaffolding)
- NYSEG (service profile scaffolding)

Current rule outputs include:
- Meter socket recommendation
- CT cabinet requirement flag
- Service conductor guidance placeholder text
- Transformer coordination guidance
- Installation component sets (overhead/underground)

Manual confirmation required:
- Exact table-driven utility conductor/metering selections
- Utility-issued revisions and exceptions
- Site-specific transformer and primary conduit requirements

Utility rules override generic assumptions where applicable, but final service design approval must be confirmed with the utility engineering process.


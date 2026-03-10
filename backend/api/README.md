# Backend API Scaffold

This folder mirrors the target architecture (`backend/api`) while preserving current runtime under:
- `services/api/src/*`

Current approach:
- Backend scaffold files re-export live route modules from `services/api/src/routes/*`
- This allows incremental migration without breaking existing service startup.


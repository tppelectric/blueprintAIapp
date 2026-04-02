# Blueprint AI — Cursor Project Context

## Core Info
- App: https://blueprint-a-iapp.vercel.app
- GitHub: tppelectric/blueprintAIapp
- Local: C:\blueprint-ai
- Supabase: tpzyqxfcqeqvjetghxmk.supabase.co
- JobTread Org ID: 22NZ7TbmM57a
- Cursor Pro Plus (no credit limits)
- Brand: #E8C84A gold, bg-[#0a1628] dark blue
- Roles: super_admin, admin, estimator, field_tech, office_manager

## App Behavior
- app/page.tsx is the default opener on desktop and mobile
- Responsive web app — must work on desktop AND mobile equally
- Homepage IS the dashboard — do not redirect away on login

## Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Supabase Pro (Auth, DB, RLS)
- Vercel Pro
- Anthropic claude-sonnet-4-6
- JobTread / Pave API (CRM integration)
- PDF.js (pdfjs-dist 4.10.38)

## Key Rules — Never Forget
- Audit ALL code before any change — never rewrite working functionality
- PowerShell: run git commands separately, no && chaining
- WiFi Analyzer is the UI standard all other analyzers must match
- Never auto-write to JobTread — read only sync
- All JobTread pushes require admin approval
- createSupabaseRouteClient(request) for API routes
- createSupabaseServerClient() for server components
- createServiceRoleClient() for admin/bypass RLS operations
- user_profiles table (not profiles)
- assets table uses UUID PKs — use DISTINCT ON not MIN()
- NEC: NY uses 2023 NEC after December 30 2025
- PowerShell: Get-Content -LiteralPath for file paths with brackets
- ChatGPT-generated code has caused issues — always audit before using
- Do NOT hallucinate — audit actual codebase before suggesting changes
- One thing at a time — complete each item fully before moving to next
- No excess UI elements — keep interfaces lean and purposeful
- Mobile and desktop must both work properly for every feature built

## Auth Patterns
- Simple routes: export const METHOD = withAuth(async (request: NextRequest, _ctx) => { ... })
- Dynamic routes: keep export async function, await context.params, return withAuth(...)(request)
- Routes using createSupabaseServerClient() + getUser() are also valid auth gates
- Role helpers: requireIntegrationAdmin, requireSuperAdmin, requireCompanyAdmin, requireTeamMember

## Completed Features (latest commit c49858f)

### Security
- 23 API routes secured with withAuth (15 CRITICAL + 8 HIGH)
- setup-first-admin hardened with ENABLE_SETUP_ROUTE env guard
- Dead upload-pdf route removed (was never called by frontend)

### Display Names
- lib/user-display-name.ts — centralized display name logic
- Resolution order: first_name + last_name → full_name → email → "—"
- Applied across: profile, admin users, jobs, crew, daily logs, requests, licenses, dashboard, receipts

### JobTread Integration
- Customer sync (342 customers)
- Job sync (587 jobs) with status mapping: created→lead, approved→active, closed→completed
- Daily logs sync (1,633 logs, zero duplicates)
- Sync history table, sync log limit 20
- job_assignments table with RLS, indexes, unique constraint

### Homepage
- Command Center full width, collapsed by default, ABOVE My Work card
- My Work + My Requests merged, collapsed by default
- Job Pipeline showing real counts: 18 Active, 441 Lead, 128 Complete
- Customer name on dashboard my-work card
- Job address showing on all screen sizes (removed hidden sm:block)

### Jobs
- Customer name on jobs board view table
- Customer name on link-to-job dialog rows
- Customer name + address on job cards (list + kanban views)

### AI Assistant
- Floating AI assistant context-aware per page
- AI conversation persistence to ai_conversations table
- AI inline request creation — create_request action type
  - Inserts directly to internal_requests via browser Supabase client
  - Shows confirmation in chat with request number
  - Never navigates away from chat
  - Prompt hardened: no JSON leak in message field
- Mobile send button padding fixed (pb-16 md:pb-3)

### Requests
- Clickable status stepper for staff users (sets adminStatus, saved on Save click)
- internal_request_status_events table deployed to Supabase
- Status event trigger deployed (fires on INSERT and UPDATE OF status)
- Status timeline populates on all new requests going forward

### PDF / Blueprints
- PDF.js worker version fixed (4.4.168 → 4.10.38)
- Blueprint upload + viewer working correctly

### Other
- Vehicle management system with NHTSA recall checking
- License & certification management with CE tracking
- Internal employee request/ticketing system (11 request types)
- ESLint set-state-in-effect fixed in admin-users-client.tsx

## Database Notes
- jobs.status: plain text, default 'Lead'
- jobs.customer_id linked to customers table (587/587 linked)
- daily_logs has jobtread_id with unique constraint
- integration_settings: customers_synced_count, jobs_synced_count, daily_logs_synced_count
- jobtread_sync_log: records_created, records_updated, record_details (jsonb)
- daily_log_attachments: original_name, mime_type, file_name, file_type, kind
- internal_request_status_events: id, request_id, status, created_by, created_at
- user_profiles table (NOT profiles)

## JobTread API Notes
- Pave API status values: created, approved, closed
- Daily log custom fields via customFieldValues nodes
- Page size for daily logs must be 25 (100 causes 413 error)
- Custom fields on jobs: targetType is costItem or customer

## Next Priorities (in order)
1. UTC → local time for "completed today" count
   - lib/internal-request-utils.ts (completedTodayUtcCount)
   - components/dashboard-my-work-card.tsx (computeRequestPipeline)
   - Fix: replace new Date().toISOString().slice(0,10) with local date
2. Pipeline filter tab colors on homepage — verify per-category 
   colors carry over correctly when card expanded/collapsed
3. Test AI inline create_request in production — verify status 
   timeline populates on new requests
4. Crew management system (new major feature):
   - crews table, crew_members table (SQL still needed)
   - Crew profiles: name, lead tech, members, default truck
   - Assign jobs by individual OR crew
   - Truck conflict detection
5. AI inline request — collect fields through conversation before 
   showing create_request action (currently fires immediately)

## SQL Tables Still Needed
- crews
- crew_members
- inbound_emails
- email_attachments
- follow_up_reminders

## Env Variables Still Needed
- POSTMARK_SERVER_TOKEN
- POSTMARK_INBOUND_ADDRESS
- NEXT_PUBLIC_APP_URL
- RESEND_API_KEY
- TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER
- GOOGLE_MAPS_API_KEY
- COMPANYCAM_API_KEY
- ENABLE_SETUP_ROUTE (set true only during initial bootstrap)

## Roadmap (longer term)
- Crew management system
- Unified Analyzer + Proposal Studio
- Email intelligence (Postmark inbound scanning)
- Meeting transcriber (Web Speech API + Claude)
- CompanyCam API integration
- NEC Energy Code (NYECCC R403.10–R405.2)
- iOS SwiftUI companion app (Blueprint AI Scan App)
  - Architecture planned, no code written
  - MVVM + Repository pattern, SwiftData, NavigationStack coordinator

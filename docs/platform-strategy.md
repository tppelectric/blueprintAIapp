# Platform Strategy

## Current direction

The AI Blueprint Scan App remains a standalone project and is not being merged with the developer's second application.

Current active implementation areas:
- Web application: `apps/web`
- Mobile companion app: `apps/mobile`
- Backend API: `services/api`
- Scanner and AI pipeline: `services/scanner`
- Database migrations: `infrastructure/migrations`

## Platform plan

### Web application

The web application is the primary development platform today.

It remains the main interface for:
- project setup
- plan import
- blueprint scanning
- takeoff workflows
- estimating
- export workflows

### iOS application

The future iOS application will live in `mobile-ios`.

Expected technology options:
- React Native
- Expo
- SwiftUI

Requirements:
- use the same backend API as the web application
- reuse the same authentication and project workflow rules
- keep mobile-specific user experience and device integrations in the iOS folder

### Desktop application

The future desktop application will live in `desktop-app`.

Expected technology options:
- Electron
- Tauri

Requirements:
- load the same frontend UI where practical
- communicate with the same backend API
- support contractor-focused desktop workflows such as local file handling and packaging

## Shared backend rule

All platforms must use the same backend services unless the architecture is intentionally changed later.

That means:
- one API contract
- one core project workflow model
- one scanning and AI processing backbone
- one database migration history

## Separation rule

The Blueprint app and the second app remain separate projects for now.

This repository structure work is only to prepare the Blueprint app for future platform growth. It does not combine workspaces or move the other app into this project.

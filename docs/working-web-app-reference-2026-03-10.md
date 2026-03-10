# Working Web App Reference

Date saved: 2026-03-10

This note captures the last known working local web app state so future work can refer back to it.

## Known-good app location

- Project folder: `C:\Users\tppel\codex\AI Blueprint Scan App`

## Start points that worked

- Full app launcher: `Open Full App.cmd`
- API launcher: `Start API Server.cmd`
- Web launcher: `Start Web App.cmd`

## Scripts behind those launchers

- Full app script: `scripts\open-full-app.ps1`
- API script: `scripts\start-api.ps1`
- Web script: `scripts\start-web.ps1`

## Runtime details that were confirmed

- Required Node version in the start scripts: `22.15.0`
- Web app URL: `http://127.0.0.1:3000`
- API health URL: `http://127.0.0.1:4000/health`

## What was verified on 2026-03-10

- API health returned HTTP `200`
- Web app root returned HTTP `200`
- The app started using the existing project launch scripts, without code changes

## Fast reference points for later

1. If the web app stops working, first compare against `scripts\start-web.ps1`.
2. If the API stops working, compare against `scripts\start-api.ps1`.
3. If both need to come up together, use `Open Full App.cmd`.
4. If startup fails, check whether Node `22.15.0` is still installed.
5. If the page does not load, confirm ports `3000` and `4000` respond locally.

## Purpose of this note

Use this file as the baseline reference for the previously working local web app state before making more changes.

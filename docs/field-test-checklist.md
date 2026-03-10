# Field-Test Readiness Checklist

Use this checklist before running a real internal test (import plan -> AI scan -> takeoff).

## 1) Preflight
Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\field-test-preflight.ps1
```

All checks must show `[PASS]`.

## 2) Required Services
You need these running:
- Web app on `http://127.0.0.1:3000`
- API on `http://127.0.0.1:4000`
- Scanner on `http://127.0.0.1:8001`
- PostgreSQL with migrations applied

## 3) Real Plan Import Test (Web)
1. Open `http://127.0.0.1:3000`.
2. Open a project.
3. Go to `Import Plans`.
4. Set:
   - Source = `Local Upload`
   - Scan Mode = `Real PDF/OCR`
5. Choose a real plan file (`.pdf`, `.png`, `.jpg`, `.jpeg`).
6. Click `Import And Scan`.
7. Confirm status says scanner processed the import.

## 4) Blueprint Processing + Takeoff
1. Click `Run Blueprint Processing`.
2. Open the project dashboard.
3. Verify these are populated:
   - detected rooms
   - symbol counts
   - takeoff summary

## 5) Fail Conditions (Do Not Field Test)
- Scanner health fails (`/health` on port 8001 not reachable)
- Import returns `Import failed. Scanner and database must be available.`
- No rooms/symbols detected after processing

## 6) Record Results
For each tested plan set, capture:
- project id
- input file name
- scan mode
- import result (pass/fail)
- takeoff result (pass/fail)
- notes for missed symbols/room mapping issues

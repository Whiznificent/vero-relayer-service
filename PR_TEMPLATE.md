## Summary
closes #55
- Add monitoring and alerting support for service health checks
- Include diagnostic report generation for DB, RPC, and disk status
- Wire heartbeat scheduling and alert channel handling into startup flow

## Changes
- Added diagnostics/heartbeat service logic for periodic checks
- Updated startup/bootstrap flow to initialize monitoring behavior
- Improved logging and runtime validation for queue, worker, and Stellar flows
- Fixed test/runtime issues uncovered during verification

## Verification
- `npm test`

## Notes
- This PR is intended to make the relayer service self-diagnostic and alert-capable while preserving existing webhook processing behavior.

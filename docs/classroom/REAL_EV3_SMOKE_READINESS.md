# Real EV3 Smoke Readiness

Date: 2026-05-23

This readiness check is non-invasive. It checks TCP reachability only;
it does not send motor commands and does not assert physical EV3
confirmation.

## Summary

- Safe to run confirmed smoke: false
- EV3 endpoint: `ev3dev.local:8765`
- EV3 reachable: false
- WeisileLink endpoint: `127.0.0.1:20111`
- WeisileLink reachable: true

## Endpoint Details

| Endpoint | Reachable | Error |
|---|---|---|
| `ev3dev.local:8765` | false | [Errno 8] nodename nor servname provided, or not known |
| `127.0.0.1:20111` | true |  |

## Next Action

Do not run `--confirm-real-ev3` yet.

Do not run --confirm-real-ev3 yet; connect physical EV3 and start WeisileLink real transport first.

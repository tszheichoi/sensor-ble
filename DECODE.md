# `decode` and regression testing — implementation notes

## Status: implemented

All scripts are live. See `harness/decode.js`, `harness/regression.js`, and `package.json`.

## Scripts

| Script | Command | Description |
|---|---|---|
| `decode` | `node harness/decode.js` | Replay all log files through all decoders; print results to stdout |
| `test:regression` | `node harness/regression.js` | Compare decoder output against committed snapshots; exit 1 on mismatch |
| `decode:update` | `node harness/regression.js --update` | Regenerate snapshot files (run after intentional decoder changes) |

## How it works

`harness/decode.js` exports `decodeAll()`, which:
- Reads every `*.json` file in `sensorlogs/` (excludes `*.snap.json`)
- Converts raw string fields to the types decoders expect:
    - `manufacturerData` hex string → `Buffer`
    - `serviceData` `"uuid:hexdata"` string → `{ uuid: Buffer }`
- Runs every decoder's `advertisementDecode()` against every record
- Returns `{ file, results[] }[]` where each result is `{ decoderName, id, time, result }`

`harness/regression.js` calls `decodeAll()` and either writes or compares `sensorlogs/<name>.snap.json` snapshot files using `assert.deepStrictEqual`.

`run()` in `decode.js` only fires when the file is the entry point (guarded by `process.argv[1]`), so importing `decodeAll` from `regression.js` does not trigger console output.

## Log file format

```json
{
  "manufacturerData": "9904...",   // hex string, empty string when absent
  "serviceData": "fcd2:...",       // "uuid:hex" string, empty string when absent
  "id": "...",                     // device UUID
  "time": "177...",                // nanosecond timestamp
  "rssi": "-72"
}
```

## Snapshot files

One `sensorlogs/<logname>.snap.json` per log file. Commit these alongside the log files so CI can run `npm run test:regression` without regenerating.

Current log files and result counts:

| Log file | Decoded results |
|---|---|
| `2026-03-28_17-22-29.json` | 306 |
| `2026-05-08_20-21-43.json` | 23 |
| `2026-05-08_20-36-52.json` | 22 |

## Workflow

```sh
# After changing a decoder, verify nothing unexpected broke:
npm run test:regression

# After an intentional decoder change (new fields, fixed values, etc.):
npm run decode:update   # review the diff, then commit the updated .snap.json
```
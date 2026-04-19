# Plan: Add `decode` npm script

## Context

The project has a `sensorlogs/` directory with captured BLE scan data (JSON arrays of raw BLE advertisement records). There is currently no way to run all decoders against these log files offline. The `decode` script should replay log files through all available decoders, the same way the live harness decodes live advertisements.

## What the script does

- Reads every `*.json` file in `sensorlogs/`
- For each record, converts the raw string fields to the types decoders expect:
    - `manufacturerData` hex string → `Buffer`
    - `serviceData` `"uuid:hexdata"` string → `{ uuid: Buffer }` object (same shape as `processServiceData` in `test.js`)
- Runs every decoder's `advertisementDecode()` against every record
- Prints decoded results to stdout

## Log file format (observed)

```json
{
  "manufacturerData": "9904...",   // hex string, empty string when absent
  "serviceData": "fcd2:...",       // "uuid:hex" string, empty string when absent
  "id": "...",                     // device UUID
  "time": "177...",                // nanosecond timestamp
  "rssi": "-72"
}
```

The log at `sensorlogs/2026-03-28_17-22-29.json` has 1,509 records; 565 have service data (`fcd2` → BTHome, `fcf1`, etc.) and 599 have manufacturer data (`9904` → Ruuvi, etc.).

## Implementation

### New file: `harness/decode.js`

```
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDecoders } from "./registry.js";

// Reuse same conversion helpers as test.js
function processManufacturerData(hex) { ... }
function processServiceData(str) { ... }   // splits "uuid:hex" into { uuid: Buffer }

async function run() {
  const decoders = await getDecoders();
  const logsDir = join(dirname(dirname(...)), "sensorlogs");

  for (const file of fs.readdirSync(logsDir).filter(f => f.endsWith(".json"))) {
    const records = JSON.parse(fs.readFileSync(...));
    for (const record of records) {
      const mfrBuf = processManufacturerData(record.manufacturerData);
      const svcBuf = processServiceData(record.serviceData);
      for (const { decoder } of decoders) {
        if (!decoder.advertisementDecode) continue;
        const result = decoder.advertisementDecode(mfrBuf, svcBuf);
        if (result != null) {
          console.log(decoder.decoderName, record.id, record.time, result);
        }
      }
    }
  }
}
```

### Edit: `package.json`

Add `"decode": "node harness/decode.js"` to the `scripts` block.

## Key reuse

- `harness/registry.js` → `getDecoders()` — same loader used by `test.js`
- `processManufacturerData` / `processServiceData` logic from `test.js` — copy into decode.js (they're 3-line helpers, not worth abstracting)

## serviceData parsing difference

`test.js` receives `{ uuid: hexString }` objects. The log files store `"uuid:hexdata"` as a single string. `processServiceData` in decode.js needs to handle the string split, then Buffer-convert the hex part.

## Verification

```sh
npm run decode
# Should print decoded BTHome lines (fcd2 service UUID → bthome decoder)
# Should print decoded Ruuvi lines (9904 manufacturer prefix → ruuvi decoder)
# Expected ~128 BTHome results and ~59 Ruuvi results from the one existing log file
```
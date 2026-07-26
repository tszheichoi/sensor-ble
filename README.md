## Sensor BLE

Sensor BLE supports decoding BLE advertisement data and streaming data from a variety of Bluetooth devices. This library is used in the [Sensor Logger](https://www.tszheichoi.com/sensorlogger) app. The device decoders are intentionally designed with no external dependencies, so that they can be used with any bluetooth library.

### Supported Devices

Sensor BLE can read data from the devices and protocols listed below. Decoders built on **Bluetooth SIG standard GATT services** (Heart Rate, Cycling Power, Cycling Speed & Cadence, Running Speed & Cadence) work with **any** device that implements the standard — the brands and models listed are non-exhaustive examples to aid discovery, not a compatibility guarantee. Decoders marked **Advertisement** read passively from broadcast data (no pairing required); those marked **Streaming** read from a GATT notification stream after connecting. Many fitness sensors are dual-band (ANT+ and BLE); only their BLE broadcast is used here, and a few devices expose data over ANT+ only.

#### Motion / IMU

| Sensor type | Decoder | Source | Example compatible devices |
| --- | --- | --- | --- |
| **WitMotion IMUs** (WitMotion BLE 5.0 protocol) | `witmotion` | Streaming | WitMotion WT901BLE, WT901BLECL, WT9011DCL-BT5.0, WT9011G4, and rebranded/clone IMUs that speak the WitMotion BLE 5.0 protocol. (Note: the classic-Bluetooth BWT901CL and wired HWT901B use a different WitMotion protocol and are **not** supported here.) |
| **221e Muse** (Muse motion & environment sensor) | `musev3` | Streaming | 221e Muse (Muse v3) |

#### Environmental & tracking (advertisement broadcasts)

| Sensor type | Decoder | Source | Example compatible devices |
| --- | --- | --- | --- |
| **RuuviTag environmental sensors** | `ruuvi` | Advertisement | RuuviTag, RuuviTag Pro |
| **BTHome v2 open-standard sensors** | `bthome` | Advertisement | Shelly BLU Button1, BLU Door/Window, BLU H&T, BLU Motion; b-parasite; ESPHome / ESP32 DIY sensors; many DIY BTHome devices |
| **Xiaomi thermometers** (ATC1441 / pvvx custom firmware) | `xiaomi_atc` | Advertisement | Xiaomi Mijia LYWSD03MMC, MHO-C401; Qingping CGG1, CGDK2; and other Telink-based thermometer/hygrometers flashed with ATC1441 or pvvx custom firmware |
| **Mopeka tank-level sensors** | `mopeka` | Advertisement | Mopeka Pro Check, Pro Check LP, Pro Check Universal, Pro Plus (the "Pro Check" propane-tank advertisement family) |
| **Apple AirPods status** | `airpods` | Advertisement | Apple AirPods, AirPods Pro, AirPods Max, Beats (battery/status from the proprietary advertisement) |

#### Cycling & Running (fitness)

| Sensor type | Decoder | Source | Example compatible devices |
| --- | --- | --- | --- |
| **Heart Rate monitors** (BLE SIG `0x180D`) | `hrs` | Streaming | Polar H9, H10, Verity Sense; Garmin HRM-Dual, HRM-Pro Plus, HRM 600, HRM 200; Wahoo TICKR, TICKR FIT; Coospo HW9, H808S; Magene H64; Scosche Rhythm+ 2.0, Rhythm24; Movesense HR+; WHOOP (HR broadcast mode); most Bluetooth chest straps & optical armbands |
| **Cycling Power meters** (BLE SIG `0x1818`) | `cps` | Streaming | Garmin Rally; Favero Assioma, Assioma Duo; Stages (L/LR/R); 4iiii Precision 3+; Quarq AXS/DZero; Power2Max NG/NGeco; Wahoo KICKR, Tacx NEO 2T, Zwift Hub, Elite Direto, and many smart trainers that expose cycling power |
| **Cycling Speed & Cadence sensors** (BLE SIG `0x1816`) | `cscs` | Streaming | Garmin Speed Sensor 2, Cadence Sensor 2; Wahoo RPM; CooSpo BK467; Magene S3+; iGPSPORT; XOSS; generic CSC speed/cadence sensors |
| **Running Speed & Cadence foot pods** (BLE SIG `0x1814`) | `rscs` | Streaming | Stryd (footpod/RSC mode); Garmin HRM-Pro Plus (broadcasts as a BLE footpod); Polar Stride Sensor; Zwift RunPod / MilestonePod |

### Using the library

#### Decoding Advertisement Data

```javascript
import { decoders } from "sensor-ble";

// Find the appropriate decoder
const ruuviDecoder = decoders.find((d) => d.decoderName === "ruuvi");
// Example Ruuvi tag data
const manufacturerData = Buffer.from(
  "99040512FC5394C37C0004FFFC040CAC364200CDCBB8334C884F",
  "hex"
);
// Decode the data
console.log(ruuviDecoder.advertisementDecode(manufacturerData));
```

#### Streaming Data

This is more complex than decoding advertisement data - see the startStreaming function in [harness/main.js](harness/main.js) as an example.

### Contributing

This project welcomes contributions, especially for supporting additional devices. Please note that all contributors must agree to the [Contributor License Agreement (CLA)](CLA.md).

### Adding a device

To add support for a new device:

1. Create a new file in the [devices](devices/) folder named after your device.
2. Implement the `decoder` object and `tests` array as described above. Follow the pattern from existing decoders like [ruuvi.js](devices/ruuvi.js) for advertisement decoding, or [muse_v3.js](devices/muse_v3.js) for streaming data.
3. Add your decoder to [main.js](main.js).
4. Ensure there is at least one test for the decoder.
5. Run `npm test` to verify your implementation works as expected.

### Sensor BLE API

Each device decoder must export:

1. A `decoder` object that implements the [Decoder](types.js) interface:

   - `decoderName`: A unique identifier for the decoder
   - `name` (optional): If specified, the BLE device name must match this for the decoder to apply
   - `manufacturer` (optional): If specified, the BLE manufacturer data must begin with this 2-byte manufacturer ID (in hex string form e.g. "9904")
   - `serviceUUID` (optional): If specified, advertisement must contain this service UUID to match (in hex string form e.g. "fcd2")
   - `advertisementDecode` (optional): Function to decode BLE manufacturer or service data in advertisements
   - `start` (optional): Function called to start data collection from the device, typically for sending the command to start data streaming
   - `stop` (optional): Function to stop data collection, typically for sending the command to stop data streaming
   - `notify` (optional): Listeners to set up given a serviceUUID and characteristicUUID, these may return decoded data (or null when listening for other information, such as the device sensor scale factor)
   - `units` (optional): Description of unit semantics
   - `frequency` (optional): Description of sampling frequency
   - `variableFormat` (optional): Set to `true` if the decoder returns different keys depending on the device. Defaults to `false` (fixed format). See [Variable Format Decoders](#variable-format-decoders)

2. A `tests` array containing test cases to validate the decoder functionality. The test array differs depending on if the decoder decodes advertisement data or is streaming. See [ruuvi.js](devices/ruuvi.js) for advertisement decoding, or [muse_v3.js](devices/muse_v3.js) for streaming data.

### Typical Workflow

The expected workflow followed by Sensor Logger (or any client) is outlined below:

1. Identify the Decoder: Use either the `manufacturer` or `name` attribute to locate the appropriate decoder for the target device.
2. Handle Advertised Data: For data broadcasted passively, use the `advertisementDecode` method to interpret the advertised information.
3. Manage Active Data Streams: For devices requiring explicit interaction:
   - Use the `start` method to initiate data collection.
   - The `notify` method will listen for incoming data streams.
   - The decoded data is then processed and stored by the data logger (e.g. Sensor Logger).
   - When data collection is complete or no longer needed, use the `stop` method to terminate the data stream and release resources.

### Decoded Data Conventions

When data is decoded (via advertisementDecode or notify), the column names used should be consistent with the following conventions. The intention is for the column names to be self-documenting for visualization, even in the absence of a schema (e.g. CSV).

- Use column name `group_name_unit` (e.g. accelerometer_x_mg) when multiple values are decoded under a group (e.g. accelerometer).
- Use column name `name_unit` (e.g. temperature_c) when a single value is decoded and no others are in the group.
- Use `unit` as "dimensionless" when the value has no unit.
- Use column name `name` (without underscoes) when the value is not expected to be shown on a plot, e.g. timestamp
- Where possible, the decoded data should include a timestamp if the device sends one.
- Do not use additional underscores in column names, e.g. `hdr_accelerometer_x_mg` is not allowed by convention. Instead use `hdrAccelerometer_x_mg` so the group is clear.

### Variable Format Decoders

By default, decoders are assumed to have a **fixed format** — every call to `advertisementDecode` or `onNotification` returns the same set of keys. This is the case for devices like RuuviTag, Mopeka, and Muse V3.

Some decoders (e.g. BTHome) are **variable format** — different devices using the same protocol may report different sensors, so the returned keys vary between devices. These decoders should set `variableFormat: true` on the decoder object:

```javascript
export const decoder = {
  decoderName: "bthome",
  serviceUUID: "fcd2",
  advertisementDecode: decodeBTHome,
  variableFormat: true,
};
```

When a consuming application (e.g. Sensor Logger) encounters a variable-format decoder, it stores the decoded output as a single `_decoded` column containing a JSON-stringified value. Commas within the JSON are replaced with `|` to preserve CSV compatibility:

```
time,seconds_elapsed,_decoded
1713500000000000000,0.000,{"temperature_C":22.5|"humidity_percent":45.0}
1713500001000000000,1.000,{"temperature_C":22.6|"humidity_percent":44.9}
```

To read the value back, replace `|` with `,` and parse as JSON.

### Project Structure

This repository is structured in two parts:

- The [devices](devices/) folder, which contains decoders for each supported device. Devices must follow the Sensor BLE API, and should contain minimal external dependencies.

- The [harness](harness/) folder, containing an implementation of the Sensor BLE API for use on desktop environments. You may find `node harness/main.js` useful for testing your BLE devices. The harness uses the `@abandonware/noble` bluetooth package, although the sensor ble decoders can be used with any reasonable bluetooth package.

### Loading a Custom Decoder into Sensor Logger
Decoders don't have to live in this repo. [Sensor Logger](https://www.tszheichoi.com/sensorlogger) can load a decoder from a URL at runtime, alongside the built-in ones. This is useful if you have a
decoder you do not want to include in Sensor Logger by default, or if you want to develop and field-test a new decoder on a real device before contributing it back here.

#### Steps
1. Write a single, self-contained `.js` file that exports a `decoder` object following the [Sensor BLE API](#sensor-ble-api) above.
2. Host it somewhere that serves the **raw** file over HTTPS. A [GitHub Gist](https://gist.github.com) is the easiest option. Any repo, server or pastebin works too, as long as the response body is plain JavaScript. With a Gist use, `https://gist.githubusercontent.com/<user>/<gist-id>/raw/<filename>.js`. If it is in a repo, use `https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.js`.
3. In Sensor Logger, go to **Settings → Device Settings → Custom Decoders → Add Decoder** and paste the URL.
4. The app fetches the file, validates it, and registers the decoder immediately. It is saved on the device and re-registered on every launch, so it keeps working offline.
5. Scan for your Bluetooth device as usual. Matching works exactly as for built-in decoders: by `manufacturer`, then `serviceUUID`, then `name`.

> Make sure the URL points at the raw file. A GitHub `.../blob/...` link returns an HTML page, not JavaScript, and will fail validation. Each custom decoder has a refresh button, which re-fetches the file from the URL it was added with. Push a change, tap refresh, and the new version replaces the old one without re-entering the URL.

#### What custom decoders may do
Custom decoder code runs inside the app, so it is loaded in a restricted sandbox. Keep to these rules:

- **No `import` or `require`.** The file must be entirely self-contained. `Buffer` and `console` are available as globals.
- **No I/O or platform access.** The code runs in strict mode with certina functions blocked, such as 'fetch' or accessing storage. 
- **One decoder per URL.** The file must export a single `decoder`.
- **Required fields.** `decoderName` must be a non-empty string, and the decoder must define either an `advertisementDecode` function, or both a `start` function and a `notify` array. Anything else is rejected before it is saved.
- If `decoderName` matches a built-in decoder, yours replaces it. Pick a distinctive name unless overriding is what you want.

> Only add decoders from sources you trust. Custom decoder code runs inside the app on your data.

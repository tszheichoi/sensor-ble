## Sensor BLE

Sensor BLE supports decoding BLE advertisement data and streaming data from a variety of Bluetooth devices. This library is used in the [Sensor Logger](https://www.tszheichoi.com/sensorlogger) app. The device decoders are intentionally designed with no external dependencies, so that they can be used with any bluetooth library.

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
   - `advertisementDecode` (optional): Function to decode BLE manufacturer data in advertisements
   - `servicedataDecode` (optional): Function to decode service data in BLE advertisements if the `serviceUUID` matches
   - `start` (optional): Function called to start data collection from the device, typically for sending the command to start data streaming
   - `stop` (optional): Function to stop data collection, typically for sending the command to stop data streaming
   - `notify` (optional): Listeners to set up given a serviceUUID and characteristicUUID, these may return decoded data (or null when listening for other information, such as the device sensor scale factor)
   - `units` (optional): Description of unit semantics
   - `frequency` (optional): Description of sampling frequency

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

### Project Structure

This repository is structured in two parts:

- The [devices](devices/) folder, which contains decoders for each supported device. Devices must follow the Sensor BLE API, and should contain minimal external dependencies.

- The [harness](harness/) folder, containing an implementation of the Sensor BLE API for use on desktop environments. You may find `node harness/main.js` useful for testing your BLE devices. The harness uses the `@abandonware/noble` bluetooth package, although the sensor ble decoders can be used with any reasonable bluetooth package.

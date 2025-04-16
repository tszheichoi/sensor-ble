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
   - `plottables`: Map of related sensor fields for plotting

2. A `tests` array containing test cases to validate the decoder functionality. The test array differs depending on if the decoder decodes advertisement data or is streaming. See [ruuvi.js](devices/ruuvi.js) for advertisement decoding, or [muse_v3.js](devices/muse_v3.js) for streaming data.

### Project Structure

This repository is structured in two parts:

- The [devices](devices/) folder, which contains decoders for each supported device. Devices must follow the Sensor BLE API, and should contain minimal external dependencies.

- The [harness](harness/) folder, containing an implementation of the Sensor BLE API for use on desktop environments. You may find `node harness/main.js` useful for testing your BLE devices. The harness uses the `@abandonware/noble` bluetooth package, although the sensor ble decoders can be used with any reasonable bluetooth package.

/**
 * A flat key-value object for decoded sensor values.
 * Keys are standardized field names, values are strings, numbers, or null if unavailable.
 * @typedef {Record<string, number | string | null>} SensorValues
 */

/**
 * @callback WriteFunction
 * @param {string} deviceId - ID of the device.
 * @param {string} serviceUuid - UUID of the service.
 * @param {string} characteristicUuid - UUID of the characteristic.
 * @param {number[]} data - Data to be written.
 * @returns {Promise<void>}
 */

/**
 * @typedef {Object} BleApi
 * @property {WriteFunction} write - Sends data to a BLE characteristic.
 */

/**
 * @callback StartFunction
 * @param {string} deviceId - ID of the device to start.
 * @param {boolean} isPreview - Whether the device is in preview mode.
 * @param {BleApi} bleApi - BLE API
 * @returns {Promise<void>}
 */

/**
 * @callback StopFunction
 * @param {string} deviceId - ID of the device to stop.
 * @param {BleApi} bleApi - BLE API
 * @returns {Promise<void>}
 */

/**
 * @callback NotificationHandler
 * @param {string} deviceId - The ID of the device receiving the notification.
 * @param {Buffer} data - The data received from the BLE characteristic in a Buffer.
 * @returns {SensorValues | null} - Decoded sensor values or null if no valid data.
 */

/**
 * @typedef {Object} NotifyEntry
 * Represents an entry in the notify array.
 * @property {string} service - UUID of the BLE service.
 * @property {string} characteristic - UUID of the BLE characteristic.
 * @property {NotificationHandler} onNotification - Function to handle notifications for the characteristic.
 */

/**
 * A decoder definition for a BLE device.
 * @typedef {Object} Decoder
 * @property {string} decoderName - Short name or ID of the decoder.
 * @property {string | undefined} name - If specified, matches against the BLE device name.
 * @property {string | undefined} manufacturer - 2-byte manufacturer ID in hex string form (e.g., "9904").
 * @property {(advertisement: Buffer) => SensorValues | undefined} [advertisementDecode] - Optional decode function for BLE advertisements.
 * @property {string | undefined} units - Description of unit semantics.
 * @property {string | undefined} frequency - Description of frequency semantics.
 * @property {StartFunction | undefined} start - Function called when starting the device.
 * @property {StopFunction | undefined} stop - Function called when stopping the device.
 * @property {NotifyEntry[] | undefined} notify - Array of objects defining notification characteristics.
 */

/**
 * A message structure for test cases.
 * @typedef {Object} TestMessage
 * @property {string} service - UUID of the service.
 * @property {string} characteristic - UUID of the characteristic.
 * @property {string} data - The hex string data that was received from this characteristic.
 */

/**
 * A test case for validating decoder output.
 * @typedef {Object} Test
 * @property {{ manufacturerData: string | undefined, data: TestMessage[] | undefined }} given - Raw hex string to decode.
 * @property {SensorValues} expected - Expected decoded output.
 */

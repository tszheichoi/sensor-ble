// Cycling Speed and Cadence Service (CSCS) decoder
// Bluetooth SIG specification v1.0
// https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSCS_v1.0/out/en/index-en.html
//
// This decoder supports any device implementing the standard BLE Cycling Speed
// and Cadence Service (UUID 0x1816), including the Garmin Bike Speed 2,
// Garmin Cadence Sensor 2, Wahoo RPM, and custom sensors.

const SERVICE_UUID = "1816";
const CSC_MEASUREMENT_UUID = "2a5b";

// Per-device state for computing delta-based speed and cadence
const stateById = {};

/**
 * Decodes a CSC Measurement notification (characteristic 0x2A5B).
 *
 * The characteristic contains:
 *   - Flags (uint8): bit 0 = wheel data present, bit 1 = crank data present
 *   - If wheel data present:
 *       Cumulative Wheel Revolutions (uint32, LE) + Last Wheel Event Time (uint16, LE, 1/1024s)
 *   - If crank data present:
 *       Cumulative Crank Revolutions (uint16, LE) + Last Crank Event Time (uint16, LE, 1/1024s)
 *
 * Speed and cadence are computed from deltas between consecutive notifications.
 * The client must know the wheel circumference to convert to real speed/distance;
 * we output revolutions-per-second so the user can multiply by their circumference.
 *
 * @param {string} deviceId
 * @param {Buffer} data
 * @returns {SensorValues | null}
 */
function onCSCMeasurement(deviceId, data) {
  if (!data || data.length < 1) return null;

  const flags = data.readUInt8(0);
  const hasWheel = (flags & 0x01) !== 0;
  const hasCrank = (flags & 0x02) !== 0;

  if (!hasWheel && !hasCrank) {
    return null; // Spec requires at least one
  }

  // Validate buffer has enough bytes
  const requiredLength = 1 + (hasWheel ? 6 : 0) + (hasCrank ? 4 : 0);
  if (data.length < requiredLength) {
    return null;
  }

  let offset = 1;
  const result = {};

  // Initialise per-device state if needed
  if (!stateById[deviceId]) {
    stateById[deviceId] = {};
  }
  const state = stateById[deviceId];

  if (hasWheel) {
    const cumulativeWheelRevolutions = data.readUInt32LE(offset);
    offset += 4;
    const lastWheelEventTime = data.readUInt16LE(offset); // 1/1024 s, rolls over at 64s
    offset += 2;

    result.cumulativeWheelRevolutions_dimensionless = cumulativeWheelRevolutions;
    result.lastWheelEventTime_1024s = lastWheelEventTime;

    // Compute wheel RPM from deltas
    if (state.prevWheelRevolutions != null && state.prevWheelEventTime != null) {
      const revDelta = cumulativeWheelRevolutions - state.prevWheelRevolutions;

      // Handle uint16 rollover for event time (rolls over every 65536 units = 64s)
      let timeDelta = lastWheelEventTime - state.prevWheelEventTime;
      if (timeDelta < 0) {
        timeDelta += 65536;
      }

      // Wheel revolutions do not roll over (UINT32 is large enough) and can be negative (backward motion)
      if (timeDelta > 0) {
        const timeDeltaSeconds = timeDelta / 1024;
        // Wheel revolutions per minute
        result.wheelRPM_rpm = (revDelta / timeDeltaSeconds) * 60;
        // Wheel revolutions per second (multiply by circumference in meters for m/s)
        result.wheelRevolutionsPerSecond_rps = revDelta / timeDeltaSeconds;
      }
    }

    state.prevWheelRevolutions = cumulativeWheelRevolutions;
    state.prevWheelEventTime = lastWheelEventTime;
  }

  if (hasCrank) {
    const cumulativeCrankRevolutions = data.readUInt16LE(offset);
    offset += 2;
    const lastCrankEventTime = data.readUInt16LE(offset); // 1/1024 s, rolls over at 64s
    offset += 2;

    result.cumulativeCrankRevolutions_dimensionless = cumulativeCrankRevolutions;
    result.lastCrankEventTime_1024s = lastCrankEventTime;

    // Compute cadence (crank RPM) from deltas
    if (state.prevCrankRevolutions != null && state.prevCrankEventTime != null) {
      let revDelta = cumulativeCrankRevolutions - state.prevCrankRevolutions;
      // Handle uint16 rollover for cumulative crank revolutions
      if (revDelta < 0) {
        revDelta += 65536;
      }

      // Handle uint16 rollover for event time
      let timeDelta = lastCrankEventTime - state.prevCrankEventTime;
      if (timeDelta < 0) {
        timeDelta += 65536;
      }

      if (timeDelta > 0 && revDelta >= 0) {
        const timeDeltaSeconds = timeDelta / 1024;
        // Cadence in RPM
        result.cadence_rpm = (revDelta / timeDeltaSeconds) * 60;
      }
    }

    state.prevCrankRevolutions = cumulativeCrankRevolutions;
    state.prevCrankEventTime = lastCrankEventTime;
  }

  return result;
}

/** @type {StartFunction} */
async function start(deviceId, isPreview, bleApi) {
  // CSCS sensors begin transmitting automatically once the client subscribes
  // to notifications on the CSC Measurement characteristic — no start command needed.
  // Reset per-device state so derived values start fresh.
  stateById[deviceId] = {};
}

/** @type {StopFunction} */
async function stop(deviceId, bleApi) {
  // No stop command needed — unsubscribing from notifications is sufficient.
  delete stateById[deviceId];
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "cscs",
  name: null,
  manufacturer: null,
  serviceUUID: SERVICE_UUID,
  advertisementDecode: null,
  start: start,
  stop: stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: CSC_MEASUREMENT_UUID,
      onNotification: onCSCMeasurement,
    },
  ],
  units:
    "Cumulative revolutions are dimensionless counts. Event times are in 1/1024 second units. " +
    "Wheel RPM and revolutions/second are derived values — multiply revolutions/second by wheel " +
    "circumference (in meters) to get speed in m/s. Cadence is in RPM (crank revolutions per minute). " +
    "Specification: https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSCS_v1.0/out/en/index-en.html",
  frequency:
    "Typically ~1 Hz (once per second), determined by the sensor. Not configurable by the client.",
};

/** @type {Test[]} */
export const tests = [
  {
    // Wheel data only (flags = 0x01).
    // Two consecutive notifications to test speed computation.
    // revDelta = 2, timeDelta = 2048 (2 seconds) => RPM = 60, rps = 1
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=100, wheelEventTime=1024
          data: "01640000000004",
        },
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=102, wheelEventTime=3072
          data: "0166000000000c",
        },
      ],
    },
    expected: {
      cumulativeWheelRevolutions_dimensionless: 102,
      lastWheelEventTime_1024s: 3072,
      wheelRPM_rpm: 60,
      wheelRevolutionsPerSecond_rps: 1,
    },
  },
  {
    // Crank data only (flags = 0x02).
    // Two consecutive notifications to test cadence computation.
    // revDelta = 1, timeDelta = 1024 (1 second) => cadence = 60 RPM
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x02, crankRevs=50, crankEventTime=2048
          data: "0232000008",
        },
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x02, crankRevs=51, crankEventTime=3072
          data: "023300000c",
        },
      ],
    },
    expected: {
      cumulativeCrankRevolutions_dimensionless: 51,
      lastCrankEventTime_1024s: 3072,
      cadence_rpm: 60,
    },
  },
  {
    // Both wheel and crank data (flags = 0x03).
    // Single notification — no derived values since it's the first sample.
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x03, wheelRevs=1000, wheelEventTime=5120, crankRevs=200, crankEventTime=5120
          data: "03e80300000014c8000014",
        },
      ],
    },
    expected: {
      cumulativeWheelRevolutions_dimensionless: 1000,
      lastWheelEventTime_1024s: 5120,
      cumulativeCrankRevolutions_dimensionless: 200,
      lastCrankEventTime_1024s: 5120,
    },
  },
  {
    // Wheel event time rollover test (uint16 wraps at 65536).
    // First notification near the max, second notification after rollover.
    // timeDelta = 512 - 65024 + 65536 = 1024 => 1 second. revDelta = 2. RPM = 120.
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=500, wheelEventTime=65024
          data: "01f401000000fe",
        },
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=502, wheelEventTime=512
          data: "01f60100000002",
        },
      ],
    },
    expected: {
      cumulativeWheelRevolutions_dimensionless: 502,
      lastWheelEventTime_1024s: 512,
      wheelRPM_rpm: 120,
      wheelRevolutionsPerSecond_rps: 2,
    },
  },
  {
    // Backward wheel motion (bike rolled in reverse).
    // revDelta = -1 (backward). timeDelta = 1024 (1 second) => RPM = -60, rps = -1
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=100, wheelEventTime=1024
          data: "01640000000004",
        },
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, wheelRevs=99, wheelEventTime=2048
          data: "01630000000008",
        },
      ],
    },
    expected: {
      cumulativeWheelRevolutions_dimensionless: 99,
      lastWheelEventTime_1024s: 2048,
      wheelRPM_rpm: -60,
      wheelRevolutionsPerSecond_rps: -1,
    },
  },
  {
    // Crank rollover (uint16 wraps at 65536).
    // First: crankRevs=65535, Second: crankRevs=100 (wrapped around).
    // revDelta = 100 - 65535 = -65435, after rollover: 101 (correct: 0->1->...->100 is 101 steps).
    // timeDelta = 2048 - 1024 = 1024 (1 second). Cadence = (101 / 1) * 60 = 6060 RPM.
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x02, crankRevs=65535, crankEventTime=1024
          data: "02ffff0004",
        },
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x02, crankRevs=100, crankEventTime=2048
          data: "0264000008",
        },
      ],
    },
    expected: {
      cumulativeCrankRevolutions_dimensionless: 100,
      lastCrankEventTime_1024s: 2048,
      cadence_rpm: 6060,
    },
  },
  {
    // Truncated buffer (invalid data).
    // Only 2 bytes instead of required 7 (flags + 6 for wheel).
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x01, but missing data
          data: "0164",
        },
      ],
    },
    expected: undefined,
  },
  {
    // No flags set (invalid per spec).
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CSC_MEASUREMENT_UUID,
          // flags=0x00 (neither wheel nor crank)
          data: "00",
        },
      ],
    },
    expected: undefined,
  },
];

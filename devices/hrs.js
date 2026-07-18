// Heart Rate Service (0x180D), Heart Rate Measurement 0x2A37.
// https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/

const SERVICE_UUID = "180d";
const HEART_RATE_MEASUREMENT_UUID = "2a37";

function onHeartRateMeasurement(deviceId, data) {
  if (!data || data.length < 2) return null;

  const flags = data.readUInt8(0);
  const isUint16 = (flags & 0x01) !== 0;
  const contactDetected = (flags & 0x02) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const hasEnergyExpended = (flags & 0x08) !== 0;
  const hasRRIntervals = (flags & 0x10) !== 0;

  const requiredLength =
    1 + (isUint16 ? 2 : 1) + (hasEnergyExpended ? 2 : 0) + (hasRRIntervals ? 2 : 0);
  if (data.length < requiredLength) return null;

  let offset = 1;
  const result = {};

  if (isUint16) {
    result.heartRate_bpm = data.readUInt16LE(offset);
    offset += 2;
  } else {
    result.heartRate_bpm = data.readUInt8(offset);
    offset += 1;
  }

  // Contact status is only meaningful when the sensor supports the feature
  if (contactSupported) {
    result.sensorContactDetected_dimensionless = contactDetected ? 1 : 0;
  }

  if (hasEnergyExpended) {
    result.energyExpended_kJ = data.readUInt16LE(offset);
    offset += 2;
  }

  if (hasRRIntervals) {
    // One or more RR-intervals fill the rest of the packet
    let index = 1;
    while (offset + 2 <= data.length) {
      result[`rrInterval${index}_s`] = data.readUInt16LE(offset) / 1024;
      offset += 2;
      index += 1;
    }
  }

  return result;
}

async function start() {}
async function stop() {}

/** @type {Decoder} */
export const decoder = {
  decoderName: "hrs",
  name: null,
  manufacturer: null,
  serviceUUID: SERVICE_UUID,
  advertisementDecode: null,
  start,
  stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: HEART_RATE_MEASUREMENT_UUID,
      onNotification: onHeartRateMeasurement,
    },
  ],
  units:
    "Heart rate in bpm, energy expended in kJ. RR-intervals converted from 1/1024s to seconds " +
    "(rrInterval1_s, rrInterval2_s, ...). sensorContactDetected is 1/0, present only when supported.",
  frequency: "Typically ~1 Hz, set by the sensor.",
};

/** @type {Test[]} */
export const tests = [
  {
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "004b" }] },
    expected: { heartRate_bpm: 75 },
  },
  {
    // 16-bit heart rate
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "013601" }] },
    expected: { heartRate_bpm: 310 },
  },
  {
    // contact detected + one RR-interval (1024 = 1s)
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "163c0004" }] },
    expected: { heartRate_bpm: 60, sensorContactDetected_dimensionless: 1, rrInterval1_s: 1 },
  },
  {
    // contact supported but not detected
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "045a" }] },
    expected: { heartRate_bpm: 90, sensorContactDetected_dimensionless: 0 },
  },
  {
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "0848e803" }] },
    expected: { heartRate_bpm: 72, energyExpended_kJ: 1000 },
  },
  {
    // two RR-intervals in one packet
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "104120033403" }] },
    expected: { heartRate_bpm: 65, rrInterval1_s: 0.78125, rrInterval2_s: 0.80078125 },
  },
  {
    // all fields set
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "1faa0059000002" }] },
    expected: {
      heartRate_bpm: 170,
      sensorContactDetected_dimensionless: 1,
      energyExpended_kJ: 89,
      rrInterval1_s: 0.5,
    },
  },
  {
    // truncated
    given: { data: [{ service: SERVICE_UUID, characteristic: HEART_RATE_MEASUREMENT_UUID, data: "0148" }] },
    expected: undefined,
  },
];

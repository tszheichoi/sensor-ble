// Running Speed and Cadence Service (0x1814), RSC Measurement 0x2A53.
// https://www.bluetooth.com/specifications/specs/running-speed-and-cadence-service-1-0/

const SERVICE_UUID = "1814";
const RSC_MEASUREMENT_UUID = "2a53";

function onRSCMeasurement(deviceId, data) {
  if (!data || data.length < 4) return null;

  const flags = data.readUInt8(0);
  const hasStrideLength = (flags & 0x01) !== 0;
  const hasTotalDistance = (flags & 0x02) !== 0;
  const isRunning = (flags & 0x04) !== 0;

  const requiredLength = 1 + 2 + 1 + (hasStrideLength ? 2 : 0) + (hasTotalDistance ? 4 : 0);
  if (data.length < requiredLength) return null;

  let offset = 1;
  const result = {};

  result.instantaneousSpeed_mps = data.readUInt16LE(offset) / 256;
  offset += 2;
  result.instantaneousCadence_spm = data.readUInt8(offset);
  offset += 1;
  result.isRunning_dimensionless = isRunning ? 1 : 0;

  if (hasStrideLength) {
    result.instantaneousStrideLength_m = data.readUInt16LE(offset) / 100;
    offset += 2;
  }
  if (hasTotalDistance) {
    result.totalDistance_m = data.readUInt32LE(offset) / 10;
    offset += 4;
  }

  return result;
}

async function start() {}
async function stop() {}

/** @type {Decoder} */
export const decoder = {
  decoderName: "rscs",
  name: null,
  manufacturer: null,
  serviceUUID: SERVICE_UUID,
  advertisementDecode: null,
  start,
  stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: RSC_MEASUREMENT_UUID,
      onNotification: onRSCMeasurement,
    },
  ],
  units:
    "Speed in m/s (from 1/256 m/s), cadence in steps/min, stride length in m (from 1/100 m), " +
    "total distance in m (from 1/10 m). isRunning is 1 running, 0 walking.",
  frequency: "Typically ~1 Hz, set by the sensor.",
};

/** @type {Test[]} */
export const tests = [
  {
    given: { data: [{ service: SERVICE_UUID, characteristic: RSC_MEASUREMENT_UUID, data: "00800150" }] },
    expected: { instantaneousSpeed_mps: 1.5, instantaneousCadence_spm: 80, isRunning_dimensionless: 0 },
  },
  {
    // all fields, running
    given: { data: [{ service: SERVICE_UUID, characteristic: RSC_MEASUREMENT_UUID, data: "0700035a7800a8610000" }] },
    expected: {
      instantaneousSpeed_mps: 3,
      instantaneousCadence_spm: 90,
      isRunning_dimensionless: 1,
      instantaneousStrideLength_m: 1.2,
      totalDistance_m: 2500,
    },
  },
  {
    // distance without stride
    given: { data: [{ service: SERVICE_UUID, characteristic: RSC_MEASUREMENT_UUID, data: "02800255ed030000" }] },
    expected: {
      instantaneousSpeed_mps: 2.5,
      instantaneousCadence_spm: 85,
      isRunning_dimensionless: 0,
      totalDistance_m: 100.5,
    },
  },
  {
    // truncated
    given: { data: [{ service: SERVICE_UUID, characteristic: RSC_MEASUREMENT_UUID, data: "0100035a" }] },
    expected: undefined,
  },
];

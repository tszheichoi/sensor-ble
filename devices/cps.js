// Cycling Power Service (0x1818), Cycling Power Measurement 0x2A63.
// https://www.bluetooth.com/specifications/specs/cycling-power-service-1-1/
// Note: wheel event time is 1/2048s here (crank stays 1/1024s), unlike CSCS.

const SERVICE_UUID = "1818";
const CYCLING_POWER_MEASUREMENT_UUID = "2a63";

const stateById = {};

function onCyclingPowerMeasurement(deviceId, data) {
  if (!data || data.length < 4) return null;

  const flags = data.readUInt16LE(0);
  const hasPedalPowerBalance = (flags & 0x0001) !== 0;
  const balanceReferenceLeft = (flags & 0x0002) !== 0;
  const hasAccumulatedTorque = (flags & 0x0004) !== 0;
  const torqueFromCrank = (flags & 0x0008) !== 0;
  const hasWheelData = (flags & 0x0010) !== 0;
  const hasCrankData = (flags & 0x0020) !== 0;
  const hasExtremeForce = (flags & 0x0040) !== 0;
  const hasExtremeTorque = (flags & 0x0080) !== 0;
  const hasExtremeAngles = (flags & 0x0100) !== 0;
  const hasTopDeadSpotAngle = (flags & 0x0200) !== 0;
  const hasBottomDeadSpotAngle = (flags & 0x0400) !== 0;
  const hasAccumulatedEnergy = (flags & 0x0800) !== 0;

  const requiredLength =
    2 + 2 +
    (hasPedalPowerBalance ? 1 : 0) +
    (hasAccumulatedTorque ? 2 : 0) +
    (hasWheelData ? 6 : 0) +
    (hasCrankData ? 4 : 0) +
    (hasExtremeForce ? 4 : 0) +
    (hasExtremeTorque ? 4 : 0) +
    (hasExtremeAngles ? 3 : 0) +
    (hasTopDeadSpotAngle ? 2 : 0) +
    (hasBottomDeadSpotAngle ? 2 : 0) +
    (hasAccumulatedEnergy ? 2 : 0);
  if (data.length < requiredLength) return null;

  let offset = 2;
  const result = {};
  const state = (stateById[deviceId] ??= {});

  result.instantaneousPower_W = data.readInt16LE(offset);
  offset += 2;

  if (hasPedalPowerBalance) {
    result.pedalPowerBalance_percent = data.readUInt8(offset) * 0.5;
    offset += 1;
    result.pedalPowerBalanceReference = balanceReferenceLeft ? "left" : "unknown";
  }

  if (hasAccumulatedTorque) {
    result.accumulatedTorque_Nm = data.readUInt16LE(offset) / 32;
    offset += 2;
    result.accumulatedTorqueSource = torqueFromCrank ? "crank" : "wheel";
  }

  if (hasWheelData) {
    const revolutions = data.readUInt32LE(offset);
    offset += 4;
    const eventTime = data.readUInt16LE(offset); // 1/2048s, wraps every 32s
    offset += 2;
    result.cumulativeWheelRevolutions_dimensionless = revolutions;
    result.lastWheelEventTime_2048s = eventTime;

    if (state.prevWheelRevolutions != null && state.prevWheelEventTime != null) {
      const revDelta = revolutions - state.prevWheelRevolutions;
      let timeDelta = eventTime - state.prevWheelEventTime;
      if (timeDelta < 0) timeDelta += 65536;
      if (timeDelta > 0) {
        const seconds = timeDelta / 2048;
        result.wheelRPM_rpm = (revDelta / seconds) * 60;
        result.wheelRevolutionsPerSecond_rps = revDelta / seconds;
      }
    }
    state.prevWheelRevolutions = revolutions;
    state.prevWheelEventTime = eventTime;
  }

  if (hasCrankData) {
    const revolutions = data.readUInt16LE(offset);
    offset += 2;
    const eventTime = data.readUInt16LE(offset); // 1/1024s, wraps every 64s
    offset += 2;
    result.cumulativeCrankRevolutions_dimensionless = revolutions;
    result.lastCrankEventTime_1024s = eventTime;

    if (state.prevCrankRevolutions != null && state.prevCrankEventTime != null) {
      let revDelta = revolutions - state.prevCrankRevolutions;
      if (revDelta < 0) revDelta += 65536;
      let timeDelta = eventTime - state.prevCrankEventTime;
      if (timeDelta < 0) timeDelta += 65536;
      if (timeDelta > 0 && revDelta >= 0) {
        result.cadence_rpm = (revDelta / (timeDelta / 1024)) * 60;
      }
    }
    state.prevCrankRevolutions = revolutions;
    state.prevCrankEventTime = eventTime;
  }

  if (hasExtremeForce) {
    result.maxForceMagnitude_N = data.readInt16LE(offset);
    offset += 2;
    result.minForceMagnitude_N = data.readInt16LE(offset);
    offset += 2;
  }

  if (hasExtremeTorque) {
    result.maxTorqueMagnitude_Nm = data.readInt16LE(offset) / 32;
    offset += 2;
    result.minTorqueMagnitude_Nm = data.readInt16LE(offset) / 32;
    offset += 2;
  }

  if (hasExtremeAngles) {
    // uint24: max angle in bits 0-11, min angle in bits 12-23
    const packed = data.readUIntLE(offset, 3);
    offset += 3;
    result.maxAngle_deg = packed & 0x0fff;
    result.minAngle_deg = packed >> 12;
  }

  if (hasTopDeadSpotAngle) {
    result.topDeadSpotAngle_deg = data.readUInt16LE(offset);
    offset += 2;
  }
  if (hasBottomDeadSpotAngle) {
    result.bottomDeadSpotAngle_deg = data.readUInt16LE(offset);
    offset += 2;
  }
  if (hasAccumulatedEnergy) {
    result.accumulatedEnergy_kJ = data.readUInt16LE(offset);
    offset += 2;
  }

  return result;
}

async function start(deviceId) {
  stateById[deviceId] = {};
}
async function stop(deviceId) {
  delete stateById[deviceId];
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "cps",
  name: null,
  manufacturer: null,
  serviceUUID: SERVICE_UUID,
  advertisementDecode: null,
  start,
  stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: CYCLING_POWER_MEASUREMENT_UUID,
      onNotification: onCyclingPowerMeasurement,
    },
  ],
  units:
    "Power in W, balance in %, torque in Nm, energy in kJ, force in N, angles in degrees. " +
    "Wheel event time is 1/2048s and crank event time is 1/1024s. Wheel/crank RPM and " +
    "revolutions/second are derived from deltas; multiply wheel rps by circumference (m) for m/s.",
  frequency: "Typically ~1 Hz, set by the sensor.",
};

/** @type {Test[]} */
export const tests = [
  {
    given: { data: [{ service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "0000fa00" }] },
    expected: { instantaneousPower_W: 250 },
  },
  {
    // negative power
    given: { data: [{ service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "0000f1ff" }] },
    expected: { instantaneousPower_W: -15 },
  },
  {
    // crank cadence from two samples
    given: {
      data: [
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "2000c80064000004" },
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "2000d2006600000c" },
      ],
    },
    expected: {
      instantaneousPower_W: 210,
      cumulativeCrankRevolutions_dimensionless: 102,
      lastCrankEventTime_1024s: 3072,
      cadence_rpm: 60,
    },
  },
  {
    // wheel speed from two samples (1/2048s)
    given: {
      data: [
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "10002c01e80300000008" },
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "10003101ec0300000018" },
      ],
    },
    expected: {
      instantaneousPower_W: 305,
      cumulativeWheelRevolutions_dimensionless: 1004,
      lastWheelEventTime_2048s: 6144,
      wheelRPM_rpm: 120,
      wheelRevolutionsPerSecond_rps: 2,
    },
  },
  {
    // balance + torque
    given: { data: [{ service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "0f00dc00648002" }] },
    expected: {
      instantaneousPower_W: 220,
      pedalPowerBalance_percent: 50,
      pedalPowerBalanceReference: "left",
      accumulatedTorque_Nm: 20,
      accumulatedTorqueSource: "crank",
    },
  },
  {
    // extreme magnitudes, angles, dead spots, energy
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CYCLING_POWER_MEASUREMENT_UUID,
          data: "c00f9001f4019cff4001e0ff5ae0100f00c3003200",
        },
      ],
    },
    expected: {
      instantaneousPower_W: 400,
      maxForceMagnitude_N: 500,
      minForceMagnitude_N: -100,
      maxTorqueMagnitude_Nm: 10,
      minTorqueMagnitude_Nm: -1,
      maxAngle_deg: 90,
      minAngle_deg: 270,
      topDeadSpotAngle_deg: 15,
      bottomDeadSpotAngle_deg: 195,
      accumulatedEnergy_kJ: 50,
    },
  },
  {
    // crank rollover
    given: {
      data: [
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "20009600ffff0004" },
        { service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "20009b0001000008" },
      ],
    },
    expected: {
      instantaneousPower_W: 155,
      cumulativeCrankRevolutions_dimensionless: 1,
      lastCrankEventTime_1024s: 2048,
      cadence_rpm: 120,
    },
  },
  {
    // truncated
    given: { data: [{ service: SERVICE_UUID, characteristic: CYCLING_POWER_MEASUREMENT_UUID, data: "1000c800" }] },
    expected: undefined,
  },
];

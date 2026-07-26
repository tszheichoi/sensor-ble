// WitMotion BLE 5.0 IMU protocol (WT901BLE, WT9011DCL-BT5.0 and clones).
// https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/bluetooth-5.0-communication-protocol
// Devices use a non-standard UUID base (...9a34fb, not the SIG ...9b34fb), so
// full 128-bit UUIDs are used and devices are matched by name prefix.

const SERVICE_UUID = "0000ffe5-0000-1000-8000-00805f9a34fb";
const DATA_UUID = "0000ffe4-0000-1000-8000-00805f9a34fb";

const FRAME_HEADER = 0x55;
const FLAG_FRAME = 0x61; // accel + gyro + angles
const REGISTER_FRAME = 0x71; // register read response (not requested)
const FRAME_LENGTH = 20;

const ACCEL_SCALE = 16 / 32768; // g
const GYRO_SCALE = 2000 / 32768; // deg/s
const ANGLE_SCALE = 180 / 32768; // deg

const MAX_BUFFER_LENGTH = 200;
const bufferById = {};

function decodeFlagFrame(buf, offset) {
  return {
    acceleration_x_g: buf.readInt16LE(offset + 2) * ACCEL_SCALE,
    acceleration_y_g: buf.readInt16LE(offset + 4) * ACCEL_SCALE,
    acceleration_z_g: buf.readInt16LE(offset + 6) * ACCEL_SCALE,
    angularVelocity_x_dps: buf.readInt16LE(offset + 8) * GYRO_SCALE,
    angularVelocity_y_dps: buf.readInt16LE(offset + 10) * GYRO_SCALE,
    angularVelocity_z_dps: buf.readInt16LE(offset + 12) * GYRO_SCALE,
    angleRoll_deg: buf.readInt16LE(offset + 14) * ANGLE_SCALE,
    anglePitch_deg: buf.readInt16LE(offset + 16) * ANGLE_SCALE,
    angleYaw_deg: buf.readInt16LE(offset + 18) * ANGLE_SCALE,
  };
}

// Notifications don't align to frames: a frame may span two, or several may
// arrive at once. Buffer per device and scan for the 0x55 header. When one
// notification yields several frames, the most recent wins.
function onDataNotification(deviceId, data) {
  if (!data || data.length === 0) return null;

  const pending = bufferById[deviceId];
  const buf = pending && pending.length > 0 ? Buffer.concat([pending, data]) : data;

  let result = null;
  let i = 0;
  while (i + 2 <= buf.length) {
    if (buf[i] !== FRAME_HEADER) {
      i += 1;
      continue;
    }
    const type = buf[i + 1];
    if (type === FLAG_FRAME) {
      if (i + FRAME_LENGTH > buf.length) break;
      result = decodeFlagFrame(buf, i);
      i += FRAME_LENGTH;
    } else if (type === REGISTER_FRAME) {
      if (i + FRAME_LENGTH > buf.length) break;
      i += FRAME_LENGTH;
    } else {
      i += 1;
    }
  }

  let remainder = buf.slice(i);
  if (remainder.length > MAX_BUFFER_LENGTH) {
    remainder = remainder.slice(remainder.length - MAX_BUFFER_LENGTH);
  }
  bufferById[deviceId] = remainder;

  return result;
}

async function start(deviceId) {
  bufferById[deviceId] = null;
}
async function stop(deviceId) {
  delete bufferById[deviceId];
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "witmotion",
  name: "WT9",
  manufacturer: null,
  advertisementDecode: null,
  start,
  stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: DATA_UUID,
      onNotification: onDataNotification,
    },
  ],
  units:
    "Acceleration in g (±16g), angular velocity in deg/s (±2000), roll/pitch/yaw in degrees " +
    "(±180). Magnetometer and quaternion require register reads and are not decoded.",
  frequency: "Device default (typically 10 Hz), configurable via WitMotion's own tools.",
};

/** @type {Test[]} */
export const tests = [
  {
    // single frame: ay=0.5g, az=1g, wy=500dps, pitch=45, yaw=90
    given: { data: [{ service: SERVICE_UUID, characteristic: DATA_UUID, data: "5561000000040008000000200000000000200040" }] },
    expected: {
      acceleration_x_g: 0,
      acceleration_y_g: 0.5,
      acceleration_z_g: 1,
      angularVelocity_x_dps: 0,
      angularVelocity_y_dps: 500,
      angularVelocity_z_dps: 0,
      angleRoll_deg: 0,
      anglePitch_deg: 45,
      angleYaw_deg: 90,
    },
  },
  {
    // negative values
    given: { data: [{ service: SERVICE_UUID, characteristic: DATA_UUID, data: "556100fc0000000800e00000000000e000000020" }] },
    expected: {
      acceleration_x_g: -0.5,
      acceleration_y_g: 0,
      acceleration_z_g: 1,
      angularVelocity_x_dps: -500,
      angularVelocity_y_dps: 0,
      angularVelocity_z_dps: 0,
      angleRoll_deg: -45,
      anglePitch_deg: 0,
      angleYaw_deg: 45,
    },
  },
  {
    // frame split across two notifications
    given: {
      data: [
        { service: SERVICE_UUID, characteristic: DATA_UUID, data: "55610000000400080000" },
        { service: SERVICE_UUID, characteristic: DATA_UUID, data: "00200000000000200040" },
      ],
    },
    expected: {
      acceleration_x_g: 0,
      acceleration_y_g: 0.5,
      acceleration_z_g: 1,
      angularVelocity_x_dps: 0,
      angularVelocity_y_dps: 500,
      angularVelocity_z_dps: 0,
      angleRoll_deg: 0,
      anglePitch_deg: 45,
      angleYaw_deg: 90,
    },
  },
  {
    // two frames in one notification: latest wins
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: DATA_UUID,
          data: "5561000000040008000000200000000000200040556100fc0000000800e00000000000e000000020",
        },
      ],
    },
    expected: {
      acceleration_x_g: -0.5,
      acceleration_y_g: 0,
      acceleration_z_g: 1,
      angularVelocity_x_dps: -500,
      angularVelocity_y_dps: 0,
      angularVelocity_z_dps: 0,
      angleRoll_deg: -45,
      anglePitch_deg: 0,
      angleYaw_deg: 45,
    },
  },
  {
    // garbage before header, must resync
    given: { data: [{ service: SERVICE_UUID, characteristic: DATA_UUID, data: "aa555561000000040008000000200000000000200040" }] },
    expected: {
      acceleration_x_g: 0,
      acceleration_y_g: 0.5,
      acceleration_z_g: 1,
      angularVelocity_x_dps: 0,
      angularVelocity_y_dps: 500,
      angularVelocity_z_dps: 0,
      angleRoll_deg: 0,
      anglePitch_deg: 45,
      angleYaw_deg: 90,
    },
  },
  {
    // register frame is skipped
    given: { data: [{ service: SERVICE_UUID, characteristic: DATA_UUID, data: "5571000000000000000000000000000000000000" }] },
    expected: undefined,
  },
  {
    // truncated
    given: { data: [{ service: SERVICE_UUID, characteristic: DATA_UUID, data: "55610000" }] },
    expected: undefined,
  },
];

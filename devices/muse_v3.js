// See https://docs.221e.com/documentation/muse-protocols/muse-v3_-communication/

const SERVICE_UUID = "c8c0a708-e361-4b5e-a365-98fa6b0a836f";
const CMD_UUID = "d5913036-2d8a-41ee-85b9-4e361aa5c8a7";
const DATA_UUID = "09bf2c52-d1d9-c0b7-4145-475964544307";

const gyroscopeMask = 0x03;
const accelerometerMask = 0x0c;
const magnetometerMask = 0xc0;
const hdrAccelerometerMask = 0x30;

const Gyroscope_CFG = {
  0x00: { fullScale: 245, sensitivityCoefficient: 0.00875 },
  0x01: { fullScale: 500, sensitivityCoefficient: 0.0175 },
  0x02: { fullScale: 1000, sensitivityCoefficient: 0.035 },
  0x03: { fullScale: 2000, sensitivityCoefficient: 0.07 },
};
const Accelerometer_CFG = {
  0x00: { fullScale: 4, sensitivityCoefficient: 0.122 },
  0x08: { fullScale: 8, sensitivityCoefficient: 0.244 },
  0x0c: { fullScale: 16, sensitivityCoefficient: 0.488 },
  0x04: { fullScale: 32, sensitivityCoefficient: 0.976 },
};
const Magnetometer_CFG = {
  0x00: { fullScale: 4, sensitivityCoefficient: 1000.0 / 6842.0 },
  0x40: { fullScale: 8, sensitivityCoefficient: 1000.0 / 3421.0 },
  0x80: { fullScale: 12, sensitivityCoefficient: 1000.0 / 2281.0 },
  0xc0: { fullScale: 16, sensitivityCoefficient: 1000.0 / 1711.0 },
};
const AccelerometerHDR_CFG = {
  0x00: { fullScale: 100, sensitivityCoefficient: 49.0 },
  0x10: { fullScale: 200, sensitivityCoefficient: 98.0 },
  0x30: { fullScale: 400, sensitivityCoefficient: 195.0 },
};

const DATA_DIRECT = 0x08;
const FREQ_25HZ = 0x01;
const FREQ_100HZ = 0x04;

const scaleById = {};
const hardwarePromiseById = {};
const hardwareById = {};
const modeById = {};

function computeAcquisitionMode(hardware, software) {
  let mode = 0x20; // Always include timestamp
  if (hardware & 0x0001) mode |= 0x01; // Gyroscope
  if (hardware & 0x0002) mode |= 0x02; // Accelerometer
  if (hardware & 0x0004) mode |= 0x04; // Magnetometer
  if (hardware & 0x0008) mode |= 0x08; // HDR Accelerometer
  if (software & 0x0001) mode |= 0x10; // Orientation (MPE)
  if ((hardware & 0x0010) && (hardware & 0x0020)) mode |= 0x40; // Temp + Humidity
  if (hardware & 0x0040) mode |= 0x80; // Temp + Pressure
  if (hardware & 0x0380) mode |= 0x300; // Range + Light (0x100 documented + 0x200 required by firmware)
  return mode;
}

function decodeFullScale(byte) {
  const gyroscopeCode = byte & gyroscopeMask;
  const accelerometerCode = byte & accelerometerMask;
  const magnetometerCode = byte & magnetometerMask;
  const hdrAccelerometerCode = byte & hdrAccelerometerMask;
  return {
    gyroscope: Gyroscope_CFG[gyroscopeCode],
    accelerometer: Accelerometer_CFG[accelerometerCode],
    magnetometer: Magnetometer_CFG[magnetometerCode],
    hdrAccelerometer: AccelerometerHDR_CFG[hdrAccelerometerCode],
  };
}

function decodeXYZ(currentPayload, offset, res) {
  let currentData = [];
  for (let i = 0; i < 3; i++) {
    currentData[i] = currentPayload.readInt16LE(offset + i * 2) * res;
  }
  return currentData;
}

function decodeTimestamp(currentPayload, offset) {
  // Timestamp is 6 bytes, little-endian. Read bytes individually to avoid overrun at end of buffer.
  let tempTime = 0n;
  for (let i = 0; i < 6; i++) {
    tempTime |= BigInt(currentPayload[offset + i]) << BigInt(i * 8);
  }
  return Number(tempTime);
}

function decodeOrientation(currentPayload, offset) {
  let currentData = [];
  for (let i = 0; i < 3; i++) {
    currentData[i + 1] = currentPayload.readInt16LE(offset + i * 2) / 32767;
  }
  currentData[0] = Math.sqrt(
    1 - (currentData[1] ** 2 + currentData[2] ** 2 + currentData[3] ** 2)
  );
  return currentData;
}

function decodeTempHum(currentPayload, offset) {
  let currentData = [];
  // Temperature (first 2 bytes)
  currentData[0] = currentPayload.readUInt16LE(offset) * 0.00267 - 45;
  // Humidity (next 2 bytes)
  currentData[1] = currentPayload.readUInt16LE(offset + 2) * 0.001907 - 6;
  return currentData;
}

function decodeTempPress(currentPayload, offset) {
  let currentData = [];
  // Pressure (first 3 bytes)
  currentData[1] = currentPayload.readUInt32LE(offset) & 0xffffff;
  currentData[1] /= 4096;
  // Temperature (next 2 bytes)
  currentData[0] = currentPayload.readUInt16LE(offset + 3) / 100;
  return currentData;
}

function decodeRange(currentPayload, offset) {
  let currentData = [];
  let range = currentPayload.readUInt16LE(offset);
  let vis = currentPayload.readUInt16LE(offset + 2);
  let ir = currentPayload.readUInt16LE(offset + 4);

  currentData[0] = range;
  currentData[1] = vis;
  currentData[2] = ir;

  let lux = 0.0;
  if (vis > 0) {
    if (ir / vis < 0.109) {
      lux = 1.534 * vis - 3.759 * ir;
    } else if (ir / vis < 0.429) {
      lux = 1.339 * vis - 1.972 * ir;
    } else if (ir / vis < 0.95 * 1.45) {
      lux = 0.701 * vis - 0.483 * ir;
    } else if (ir / vis < 1.5 * 1.45) {
      lux = 2.0 * 0.701 * vis - 1.18 * 0.483 * ir;
    } else if (ir / vis < 2.5 * 1.45) {
      lux = 4.0 * 0.701 * vis - 1.33 * 0.483 * ir;
    } else {
      lux = 8.0 * 0.701 * vis;
    }
  } else {
    lux = 0.0; // manage division by zero
  }
  currentData[3] = lux;
  return currentData;
}

/** @type {NotificationHandler} */
function onDataCharacteristic(deviceId, data) {
  if (scaleById[deviceId] == null) {
    console.log("No scale found for deviceId, cannot decode", deviceId);
    return;
  }
  const scale = scaleById[deviceId];
  const mode = modeById[deviceId] || 0x1ff; // fallback to full mode
  let offset = 8;
  const result = {};
  if (mode & 0x01) {
    const v = decodeXYZ(data, offset, scale.gyroscope.sensitivityCoefficient);
    offset += 6;
    result.gyroscope_x_dps = v[0]; result.gyroscope_y_dps = v[1]; result.gyroscope_z_dps = v[2];
  }
  if (mode & 0x02) {
    const v = decodeXYZ(data, offset, scale.accelerometer.sensitivityCoefficient);
    offset += 6;
    result.acceleration_x_mg = v[0]; result.acceleration_y_mg = v[1]; result.acceleration_z_mg = v[2];
  }
  if (mode & 0x04) {
    const v = decodeXYZ(data, offset, scale.magnetometer.sensitivityCoefficient);
    offset += 6;
    result.magnetometer_x_uT = v[0]; result.magnetometer_y_uT = v[1]; result.magnetometer_z_uT = v[2];
  }
  if (mode & 0x08) {
    const v = decodeXYZ(data, offset, scale.hdrAccelerometer.sensitivityCoefficient);
    offset += 6;
    result.hdrAcceleration_x_mg = v[0]; result.hdrAcceleration_y_mg = v[1]; result.hdrAcceleration_z_mg = v[2];
  }
  if (mode & 0x10) {
    const v = decodeOrientation(data, offset);
    offset += 6;
    result.orientation_w_dimensionless = v[0]; result.orientation_x_dimensionless = v[1];
    result.orientation_y_dimensionless = v[2]; result.orientation_z_dimensionless = v[3];
  }
  if (mode & 0x20) {
    result.timestamp = decodeTimestamp(data, offset);
    offset += 6;
  }
  if (mode & 0x40) {
    const v = decodeTempHum(data, offset);
    offset += 6;
    result.temperature_C = v[0]; result.humidity_percent = v[1];
  }
  if (mode & 0x80) {
    const v = decodeTempPress(data, offset);
    offset += 6;
    result.temperature2_C = v[0]; result.pressure_Pa = v[1];
  }
  if (mode & 0x100) {
    const v = decodeRange(data, offset);
    offset += 6;
    result.range_range_dimensionless = v[0]; result.range_vis_dimensionless = v[1];
    result.range_ir_dimensionless = v[2]; result.range_lux_dimensionless = v[3];
  }
  return result;
}

/** @type {NotificationHandler} */
function onCmdCharacteristic(deviceId, data) {
  if (data[0] === 0x00 && data[1] === 0x05 && data[2] === 0xc0) {
    scaleById[deviceId] = decodeFullScale(data[4]);
  }
  if (data[0] === 0x00 && data[1] === 0x0a && data[2] === 0x8f) {
    const hardware = data.readUInt32LE(4);
    const software = data.readUInt32LE(8);
    hardwareById[deviceId] = hardware;
    modeById[deviceId] = computeAcquisitionMode(hardware, software);
    if (hardwarePromiseById[deviceId]) {
      hardwarePromiseById[deviceId](); // resolve sensors promise
    }
  }
}

/** @type {StartFunction} */
async function start(deviceId, isPreview, bleApi) {
  const gotSensors = new Promise(
    (resolve) => (hardwarePromiseById[deviceId] = resolve)
  );
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0x8f, 0x00]); // Get Device Sensors
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0xc0, 0x00]); // Get Device Scales
  await gotSensors;
  const mode = modeById[deviceId];
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [
    0x02,
    0x05,
    DATA_DIRECT,
    mode & 0xff,
    (mode >> 8) & 0xff,
    (mode >> 16) & 0xff,
    isPreview ? FREQ_25HZ : FREQ_100HZ,
  ]);
}

/** @type {StopFunction} */
async function stop(deviceId, bleApi) {
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0x02, 0x01, 0x02]);
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "musev3",
  name: "muse_v3",
  manufacturer: null,
  advertisementDecode: null,
  start: start,
  stop: stop,
  notify: [
    {
      service: SERVICE_UUID,
      characteristic: CMD_UUID,
      onNotification: onCmdCharacteristic,
    },
    {
      service: SERVICE_UUID,
      characteristic: DATA_UUID,
      onNotification: onDataCharacteristic,
    },
  ],
  units:
    "Values will be in the appropriate units based on documentation: https://docs.221e.com/documentation/muse-protocols/muse-v3_-communication/",
  frequency:
    "Logs at 100Hz for all sensors, except for temperature, humidity, and pressure which are 25Hz. When previewing, all sensors are at 25Hz.",
};

/** @type {Test[]} */
export const tests = [
  {
    // Streaming test (FULL device). All sensors present (hw=0x7FF, sw=0x01 MPE).
    given: {
      data: [
        {
          // This message provides the device hardware
          service: SERVICE_UUID,
          characteristic: CMD_UUID,
          data: "000a8f00ff070000010000000000000000000000",
        },
        {
          // This message provides the device scales
          service: SERVICE_UUID,
          characteristic: CMD_UUID,
          data: "0005c00047000000000000000000000000000000",
        },
        {
          // This message contains the data
          service: SERVICE_UUID,
          characteristic: DATA_UUID,
          data: "b2b6645726470000feff0600faff0b001e00e2032b00c6f9de0080ff70ffa0ff3a0146000a00b3b6645726005362e85f0000aa373d100900000055000000",
        },
      ],
    },
    expected: {
      gyroscope_x_dps: -0.14,
      gyroscope_y_dps: 0.42000000000000004,
      gyroscope_z_dps: -0.42000000000000004,
      acceleration_x_mg: 10.736,
      acceleration_y_mg: 29.28,
      acceleration_z_mg: 970.144,
      magnetometer_x_uT: 12.569424144986845,
      magnetometer_y_uT: -465.94562993276816,
      magnetometer_z_uT: 64.89330605086232,
      hdrAcceleration_x_mg: -6272,
      hdrAcceleration_y_mg: -7056,
      hdrAcceleration_z_mg: -4704,
      orientation_w_dimensionless: 0.9999517552449917,
      orientation_x_dimensionless: 0.009582811975463118,
      orientation_y_dimensionless: 0.0021362956633198035,
      orientation_z_dimensionless: 0.0003051850947599719,
      timestamp: 164674975411,
      temperature_C: 22.20657,
      humidity_percent: 40.820664,
      temperature2_C: 23.2,
      pressure_Pa: 979.47900390625,
      range_range_dimensionless: 0,
      range_vis_dimensionless: 85,
      range_ir_dimensionless: 0,
      range_lux_dimensionless: 130.39000000000001,
    },
  },
  {
    // Streaming test (IMU device). Only gyro+accel+mag (hw=0x07, sw=0x01 MPE).
    // Packet: 8-byte header + gyro(6) + accel(6) + mag(6) + orient(6) + time(6) + 2 padding bytes.
    given: {
      data: [
        {
          service: SERVICE_UUID,
          characteristic: CMD_UUID,
          data: "000a8f0007000000010000000000000000000000",
        },
        {
          service: SERVICE_UUID,
          characteristic: CMD_UUID,
          data: "0005c00047000000000000000000000000000000",
        },
        {
          service: SERVICE_UUID,
          characteristic: DATA_UUID,
          data: "b2b6645726470000feff0600faff0b001e00e2032b00c6f9de003a0146000a00b3b6645726000000",
        },
      ],
    },
    expected: {
      gyroscope_x_dps: -0.14,
      gyroscope_y_dps: 0.42000000000000004,
      gyroscope_z_dps: -0.42000000000000004,
      acceleration_x_mg: 10.736,
      acceleration_y_mg: 29.28,
      acceleration_z_mg: 970.144,
      magnetometer_x_uT: 12.569424144986845,
      magnetometer_y_uT: -465.94562993276816,
      magnetometer_z_uT: 64.89330605086232,
      orientation_w_dimensionless: 0.9999517552449917,
      orientation_x_dimensionless: 0.009582811975463118,
      orientation_y_dimensionless: 0.0021362956633198035,
      orientation_z_dimensionless: 0.0003051850947599719,
      timestamp: 164674975411,
    },
  },
];

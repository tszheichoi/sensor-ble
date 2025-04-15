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
  // Note that timestamp is 6 bytes long, and is offset (though we only use relative time to avoid device time drift so ignore the offset)
  let tempTime =
    currentPayload.readBigUInt64LE(offset) & BigInt(0x0000ffffffffffff);
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
  let offset = 8;
  const gyro = decodeXYZ(data, offset, scale.gyroscope.sensitivityCoefficient);
  offset += 6;
  const accel = decodeXYZ(
    data,
    offset,
    scale.accelerometer.sensitivityCoefficient
  );
  offset += 6;
  const mag = decodeXYZ(
    data,
    offset,
    scale.magnetometer.sensitivityCoefficient
  );
  offset += 6;
  const hdrAccel = decodeXYZ(
    data,
    offset,
    scale.hdrAccelerometer.sensitivityCoefficient
  );
  offset += 6;
  const orientation = decodeOrientation(data, offset);
  offset += 6;
  const timestamp = decodeTimestamp(data, offset);
  offset += 6;
  const tempHum = decodeTempHum(data, offset);
  offset += 6;
  const tempPress = decodeTempPress(data, offset);
  offset += 6;
  const rangeLux = decodeRange(data, offset);
  offset += 6;
  // const sound = ""; // TODO: don't know how to decode sound data
  return {
    gyro_x: gyro[0],
    gyro_y: gyro[1],
    gyro_z: gyro[2],
    accel_x: accel[0],
    accel_y: accel[1],
    accel_z: accel[2],
    mag_x: mag[0],
    mag_y: mag[1],
    mag_z: mag[2],
    hdr_accel_x: hdrAccel[0],
    hdr_accel_y: hdrAccel[1],
    hdr_accel_z: hdrAccel[2],
    orientation_w: orientation[0],
    orientation_x: orientation[1],
    orientation_y: orientation[2],
    orientation_z: orientation[3],
    temperature: tempHum[0],
    humidity: tempHum[1],
    temperature2: tempPress[0],
    pressure: tempPress[1],
    range: rangeLux[0],
    range_vis: rangeLux[1],
    range_ir: rangeLux[2],
    range_lux: rangeLux[3],
    timestamp: timestamp,
  };
}

/** @type {NotificationHandler} */
function onCmdCharacteristic(deviceId, data) {
  if (data[0] === 0x00 && data[1] === 0x05 && data[2] === 0xc0) {
    scaleById[deviceId] = decodeFullScale(data[4]);
  }
}

/** @type {StartFunction} */
async function start(deviceId, isPreview, bleApi) {
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0xc0, 0x00]);
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [
    0x02,
    0x05,
    DATA_DIRECT,
    0xff,
    0x03,
    0x00,
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
  plottables: {
    Acceleration: {
      unit: "mg",
      fields: ["accel_x", "accel_y", "accel_z"],
    },
    Gyroscope: {
      unit: "dps",
      fields: ["gyro_x", "gyro_y", "gyro_z"],
    },
    Magnetometer: {
      unit: "uT",
      fields: ["mag_x", "mag_y", "mag_z"],
    },
    HDR_Acceleration: {
      unit: "mg",
      fields: ["hdr_accel_x", "hdr_accel_y", "hdr_accel_z"],
    },
    Orientation: {
      unit: null,
      fields: [
        "orientation_w",
        "orientation_x",
        "orientation_y",
        "orientation_z",
      ],
    },
    Temperature: {
      unit: "°C",
      fields: ["temperature", "temperature2"],
    },
    Humidity: {
      unit: "%",
      fields: ["humidity"],
    },
    Pressure: {
      unit: "Pa",
      fields: ["pressure"],
    },
    Lux: {
      unit: "Lux",
      fields: ["range_lux"],
    },
  },
};

/** @type {Test[]} */
export const tests = [
  {
    // Streaming test. We simulate the messages in data being sent in order to the notify callbacks, and expect the most recent
    // non-null result to match the expected values.
    given: {
      data: [
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
      gyro_x: -0.14,
      gyro_y: 0.42000000000000004,
      gyro_z: -0.42000000000000004,
      accel_x: 10.736,
      accel_y: 29.28,
      accel_z: 970.144,
      mag_x: 12.569424144986845,
      mag_y: -465.94562993276816,
      mag_z: 64.89330605086232,
      hdr_accel_x: -6272,
      hdr_accel_y: -7056,
      hdr_accel_z: -4704,
      orientation_w: 0.9999517552449917,
      orientation_x: 0.009582811975463118,
      orientation_y: 0.0021362956633198035,
      orientation_z: 0.0003051850947599719,
      temperature: 22.20657,
      humidity: 40.820664,
      temperature2: 23.2,
      pressure: 979.47900390625,
      range: 0,
      range_vis: 85,
      range_ir: 0,
      range_lux: 130.39000000000001,
      timestamp: 164674975411,
    },
  },
];

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
const Hardware = {
  0x0001: "Gyroscope",
  0x0002: "Acceleration",
  0x0004: "Magnetometer",
  0x0008: "HDR_Acceleration",
  0x0010: "Temperature",
  0x0020: "Humidity",
  0x0040: "Pressure",
  0x0080: "Lux_VS",
  0x0100: "Lux_IR",
  0x0200: "Range",
  0x0400: "Microphone",
};
// Map of acquisition modes to BLE command parameters
const MODE_COMMANDS = {
  GYR: 0x000001, // Gyroscope
  AXL: 0x000002, // Accelerometer
  MAG: 0x000004, // Magnetometer
  HDR: 0x000008, // High Dynamic Range Accelerometer
  QUAT: 0x000010, // Orientation Quaternion
  TIME: 0x000020, // Timestamp
  TH: 0x000040, // Temperature + Humidity
  TP: 0x000080, // Temperature + Pressure
  RNG: 0x000100, // Range + Light Intensity
  SND: 0x000400, // Microphone
};

const DATA_DIRECT = 0x08;
const FREQ_25HZ = 0x01;
const FREQ_50HZ = 0x02;
const FREQ_100HZ = 0x04;

const scaleById = {};
const hardwarePromiseById = {};
const hardwareById = {};
const acqModeById = {};

/**
 * Build sensor combination based on available hardware
 * @param {string[]} hardware - List of available hardware from device
 * @returns {number} Acquisition mode code
 */
function buildAcqMode(hardware) {
  // Note as per docs: the total size of the package must be equal to 6, 12, 24, 30, or 60 bytes
  const hasGyro = hardware.includes("Gyroscope");
  const hasAccel = hardware.includes("Acceleration");
  const hasMag = hardware.includes("Magnetometer");
  const hasTemp = hardware.includes("Temperature");
  const hasHum = hardware.includes("Humidity");
  const hasPress = hardware.includes("Pressure");
  const hasRange = hardware.includes("Range");
  const hasLux = hardware.includes("Lux_VS") || hardware.includes("Lux_IR");
  const hasHDR = hardware.includes("HDR_Acceleration");

  if (
    hasGyro &&
    hasAccel &&
    hasMag &&
    hasTemp &&
    hasHum &&
    hasPress &&
    hasRange &&
    hasLux &&
    hasHDR
  ) {
    // 0xff 0x01 0x00
    return (
      MODE_COMMANDS["GYR"] |
      MODE_COMMANDS["AXL"] |
      MODE_COMMANDS["MAG"] |
      MODE_COMMANDS["HDR"] |
      MODE_COMMANDS["QUAT"] |
      MODE_COMMANDS["TIME"] |
      MODE_COMMANDS["TH"] |
      MODE_COMMANDS["TP"] |
      MODE_COMMANDS["RNG"]
    );
  }

  if (hasGyro && hasAccel && hasMag) {
    // 0x37 0x00 0x00
    return (
      MODE_COMMANDS["GYR"] |
      MODE_COMMANDS["AXL"] |
      MODE_COMMANDS["MAG"] |
      MODE_COMMANDS["QUAT"] |
      MODE_COMMANDS["TIME"]
    );
  }

  // If none of the above work, log error and return 0
  console.error("Unable to configure Muse V3: insufficient hardware available");
  console.error("Available hardware:", hardware);
  return 0;
}

function decodeHardware(byte) {
  let supportedHardware = [];
  for (const [mask, name] of Object.entries(Hardware)) {
    if ((byte & Number(mask)) !== 0) {
      // device supports this hardware
      supportedHardware.push(name);
    }
  }
  return supportedHardware;
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
  // Note that timestamp is 6 bytes long, and is offset (though we only use relative time to avoid device time drift so ignore the offset)
  // (Read 6 bytes manually to avoid reading beyond the timestamp data)
  let tempTime = BigInt(0);
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
  const acq = acqModeById[deviceId];
  let offset = 8;

  let gyro = [null, null, null];
  if ((acq & MODE_COMMANDS["GYR"]) !== 0) {
    gyro = decodeXYZ(data, offset, scale.gyroscope.sensitivityCoefficient);
    offset += 6;
  }

  let accel = [null, null, null];
  if ((acq & MODE_COMMANDS["AXL"]) !== 0) {
    accel = decodeXYZ(data, offset, scale.accelerometer.sensitivityCoefficient);
    offset += 6;
  }

  let mag = [null, null, null];
  if ((acq & MODE_COMMANDS["MAG"]) !== 0) {
    mag = decodeXYZ(data, offset, scale.magnetometer.sensitivityCoefficient);
    offset += 6;
  }

  let hdrAccel = [null, null, null];
  if ((acq & MODE_COMMANDS["HDR"]) !== 0) {
    hdrAccel = decodeXYZ(
      data,
      offset,
      scale.hdrAccelerometer.sensitivityCoefficient
    );
    offset += 6;
  }

  let orientation = [null, null, null, null];
  if ((acq & MODE_COMMANDS["QUAT"]) !== 0) {
    orientation = decodeOrientation(data, offset);
    offset += 6;
  }

  let timestamp = null;
  if ((acq & MODE_COMMANDS["TIME"]) !== 0) {
    timestamp = decodeTimestamp(data, offset);
    offset += 6;
  }

  let tempHum = [null, null];
  if ((acq & MODE_COMMANDS["TH"]) !== 0) {
    tempHum = decodeTempHum(data, offset);
    offset += 6;
  }

  let tempPress = [null, null];
  if ((acq & MODE_COMMANDS["TP"]) !== 0) {
    tempPress = decodeTempPress(data, offset);
    offset += 6;
  }

  let rangeLux = [null, null, null, null];
  if ((acq & MODE_COMMANDS["RNG"]) !== 0) {
    rangeLux = decodeRange(data, offset);
    offset += 6;
  }

  return {
    gyroscope_x_dps: gyro[0],
    gyroscope_y_dps: gyro[1],
    gyroscope_z_dps: gyro[2],
    acceleration_x_mg: accel[0],
    acceleration_y_mg: accel[1],
    acceleration_z_mg: accel[2],
    magnetometer_x_uT: mag[0],
    magnetometer_y_uT: mag[1],
    magnetometer_z_uT: mag[2],
    hdrAcceleration_x_mg: hdrAccel[0],
    hdrAcceleration_y_mg: hdrAccel[1],
    hdrAcceleration_z_mg: hdrAccel[2],
    orientation_w_dimensionless: orientation[0],
    orientation_x_dimensionless: orientation[1],
    orientation_y_dimensionless: orientation[2],
    orientation_z_dimensionless: orientation[3],
    temperature_C: tempHum[0],
    humidity_percent: tempHum[1],
    temperature2_C: tempPress[0],
    pressure_Pa: tempPress[1],
    range_range_dimensionless: rangeLux[0],
    range_vis_dimensionless: rangeLux[1],
    range_ir_dimensionless: rangeLux[2],
    range_lux_dimensionless: rangeLux[3],
    timestamp: timestamp,
  };
}

/** @type {NotificationHandler} */
function onCmdCharacteristic(deviceId, data) {
  // Check ack msg (0x00) and error code (0: OK, 1:ERROR)
  if (data[0] !== 0x00 || data[3] !== 0x00) {
    return; // error message
  }
  if (data[2] === 0xc0) {
    // Full scale
    scaleById[deviceId] = decodeFullScale(data[4]);
  }
  if (data[2] === 0x8f) {
    // Hardware config
    const hardware = decodeHardware(data.readUInt32LE(4));
    hardwareById[deviceId] = hardware;
    hardwarePromiseById[deviceId](hardware); // resolve sensors promise
  }
  if (data[1] === 0x09 && data[2] === 0x02) {
    // Start acquisition
    acqModeById[deviceId] = (data[9] << 16) | (data[8] << 8) | data[7];
  }
}

/** @type {StartFunction} */
async function start(deviceId, isPreview, bleApi) {
  const gotSensors = new Promise(
    (resolve) => (hardwarePromiseById[deviceId] = resolve)
  );
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0x8f, 0x00]); // Get Device Sensors
  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [0xc0, 0x00]); // Get Device Scales

  // Build acquisition mode based on available hardware
  const hardware = await gotSensors;
  const acqMode = buildAcqMode(hardware);
  if (acqMode === 0) {
    return; // (Unable to configure)
  }

  const acqByte1 = acqMode & 0xff;
  const acqByte2 = (acqMode >> 8) & 0xff;
  const acqByte3 = (acqMode >> 16) & 0xff;

  await bleApi.write(deviceId, SERVICE_UUID, CMD_UUID, [
    0x02,
    0x05,
    DATA_DIRECT,
    acqByte1,
    acqByte2,
    acqByte3,
    isPreview ? FREQ_25HZ : FREQ_50HZ,
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
    "Logs at 50Hz for all enabled sensors. When previewing, all sensors are at 25Hz.",
};

/** @type {Test[]} */
export const tests = [
  {
    // Streaming test. We simulate the messages in data being sent in order to the notify callbacks, and expect the most recent
    // non-null result to match the expected values.
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
          // This message is an ack for starting acquisition
          service: SERVICE_UUID,
          characteristic: CMD_UUID,
          data: "00090200470000ff010001000000000000000000",
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
      temperature_C: 22.20657,
      humidity_percent: 40.820664,
      temperature2_C: 23.2,
      pressure_Pa: 979.47900390625,
      range_range_dimensionless: 0,
      range_vis_dimensionless: 85,
      range_ir_dimensionless: 0,
      range_lux_dimensionless: 130.39000000000001,
      timestamp: 164674975411,
    },
  },
];

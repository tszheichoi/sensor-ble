/**
 * Decodes BTHome servicedata.
 * @param {Buffer} serviceData - The data buffer to decode.
 * @returns {SensorValues} A key-value map of decoded sensor values.
 *
 * based mostly on code copyright (c) 2017-2025 AlCalzone
 * https://github.com/AlCalzone/ioBroker.ble.git
 * MIT license
 */
function decodeBTHome(_manufacturerData, serviceData) {
  let data = serviceData["fcd2"];
  if (
    data.length < 4 || // too short
    data[0] & 0x01 || // encrypted data not supported
    (data[0] & 0xe0) >> 5 != 2 // not BTHome v2
  ) {
    return null;
  }
  const result = {};
  const mac_included = (data[0] & 0x02) != 0;
  if (mac_included) {
    result.macAddress = data
      .slice(1, 7)
      .reverse()
      .toString("hex")
      .match(/.{1,2}/g)
      ?.join(":");
    data = data.slice(7);
  } else {
    data = data.slice(1);
  }
  while (data.length > 0) {
    const objectId = data[0];
    if (objectId === 0x00) {
      result.packetId = data[1];
      data = data.slice(2);
    } else if (multilevelSensorDefinitions.has(objectId)) {
      const def = multilevelSensorDefinitions.get(objectId);
      let value = def.signed
        ? data.readIntLE(1, def.size)
        : data.readUIntLE(1, def.size);
      if (def.factor) {
        value *= def.factor;
      }
      let key = def.label;
      if (def.unit) {
        key += `_${def.unit}`;
      }
      result[key] = value;
      data = data.slice(1 + def.size);
    } else if (binarySensorDefinitions.has(objectId)) {
      const def = binarySensorDefinitions.get(objectId);
      result[def.label] = data[1] === 0x01;
      data = data.slice(2);
    } else if (objectId === 0x3a) {
      // button event
      const eventId = data[1];
      if (eventId !== 0x00) {
        const buttonEvents = {
          0x01: "press",
          0x02: "double_press",
          0x03: "triple_press",
          0x04: "long_press",
          0x05: "long_double_press",
          0x06: "long_triple_press",
          0x80: "hold_press",
        };
        result.button = buttonEvents[eventId];
      }
      data = data.slice(2);
    } else if (objectId === 0x3c) {
      const eventId = data[1];
      if (eventId !== 0x00) {
        const event = ["RotateLeft", "RotateRight"][eventId - 1];
        const steps = data[2];
        result[`dimmer${event}`] = steps;
      }
      data = data.slice(3);
    } else if (objectId === 0x50) {
      // unix timestamp UTC
      const timestamp = data.readUInt32LE(1);
      result.timestamp = new Date(timestamp * 1000);
      data = data.slice(5);
    } else if (objectId === 0x53) {
      // text sensor (utf8)
      const length = data[1];
      const value = data.slice(2, 2 + length).toString("utf8");
      result.text = value;
      data = data.slice(2 + length);
    } else if (objectId === 0x54) {
      // raw sensor
      const length = data[1];
      const value = data.slice(2, 2 + length);
      result.raw = value.toString("hex");
      data = data.slice(2 + length);

    } else if (objectId === 0xF0) { // device type id, 	uint16 (2 bytes)
      result[`devicetype`] = data.readUInt16LE(1); // little endian);
      data = data.slice(3);

    } else if (objectId === 0xF1) { // firmware version, 	uint32 (4 bytes)
      const rel = data[1];
      const patch = data[2];
      const minor = data[3];
      const major = data[4];
      result[`fwversion4`] = `${major}.${minor}.${patch}.${rel}`;
      data = data.slice(5);

    } else if (objectId === 0xF2) { // firmware version, uint24 (3 bytes)
      const patch = data[1];
      const minor = data[2];
      const major = data[3];
      result[`fwversion3`] = `${major}.${minor}.${patch}`;
      data = data.slice(4);
    } else {
      console.log(`Unsupported BTHome object ID ${objectId.toString(16)}`);
      return {};
    }
  }
  return result;
}

const multilevelSensorsArray = [
  {
    id: 0x51,
    label: "acceleration",
    signed: false,
    size: 2,
    factor: 0.001,
    unit: "m/s²",
  },
  {
    id: 0x63,
    label: "acceleration",
    signed: true,
    size: 4,
    factor: 0.000001,
    unit: "m/s²",
  },
  {
    id: 0x01,
    label: "battery",
    signed: false,
    size: 1,
    unit: "percent",
  },
  {
    id: 0x12,
    label: "co2",
    signed: false,
    size: 2,
    unit: "ppm",
  },
  { id: 0x09, label: "count", signed: false, size: 1 },
  { id: 0x3d, label: "count", signed: false, size: 2 },
  { id: 0x3e, label: "count", signed: false, size: 4 },
  {
    id: 0x43,
    label: "current",
    signed: false,
    size: 2,
    factor: 0.001,
    unit: "A",
  },
  {
    id: 0x08,
    label: "dewpoint",
    signed: true,
    size: 2,
    factor: 0.01,
    unit: "°C",
  },
  {
    id: 0x40,
    label: "distance (mm)",
    signed: false,
    size: 2,
    unit: "mm",
  },
  {
    id: 0x41,
    label: "distance (m)",
    signed: false,
    size: 2,
    factor: 0.1,
    unit: "m",
  },
  {
    id: 0x42,
    label: "duration",
    signed: false,
    size: 3,
    factor: 0.001,
    unit: "s",
  },
  {
    id: 0x4d,
    label: "energy",
    signed: false,
    size: 4,
    factor: 0.001,
    unit: "kWh",
  },
  {
    id: 0x0a,
    label: "energy",
    signed: false,
    size: 3,
    factor: 0.001,
    unit: "kWh",
  },
  {
    id: 0x4b,
    label: "gas",
    signed: false,
    size: 3,
    factor: 0.001,
    unit: "m3",
  },
  {
    id: 0x4c,
    label: "gas",
    signed: false,
    size: 4,
    factor: 0.001,
    unit: "m3",
  },
  {
    id: 0x52,
    label: "gyroscope",
    signed: false,
    size: 2,
    factor: 0.001,
    unit: "°/s",
  },
  {
    id: 0x03,
    label: "humidity",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "percent",
  },
  {
    id: 0x2e,
    label: "humidity",
    signed: false,
    size: 1,
    unit: "percent",
  },
  {
    id: 0x05,
    label: "illuminance",
    signed: false,
    size: 3,
    factor: 0.01,
    unit: "lux",
  },
  {
    id: 0x06,
    label: "mass (kg)",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "kg",
  },
  {
    id: 0x07,
    label: "mass (lb)",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "lb",
  },
  {
    id: 0x14,
    label: "moisture",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "percent",
  },
  {
    id: 0x2f,
    label: "moisture",
    signed: false,
    size: 1,
    unit: "percent",
  },
  {
    id: 0x0d,
    label: "pm2.5",
    signed: false,
    size: 2,
    unit: "ug/m3",
  },
  {
    id: 0x0e,
    label: "pm10",
    signed: false,
    size: 2,
    unit: "ug/m3",
  },
  {
    id: 0x0b,
    label: "power",
    signed: false,
    size: 3,
    factor: 0.01,
    unit: "W",
  },
  {
    id: 0x04,
    label: "pressure",
    signed: false,
    size: 3,
    factor: 0.01,
    unit: "hPa",
  },
  {
    id: 0x3f,
    label: "rotation",
    signed: true,
    size: 2,
    factor: 0.1,
    unit: "°",
  },
  {
    id: 0x44,
    label: "speed",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "m/s",
  },
  {
    id: 0x62,
    label: "speed",
    signed: true,
    size: 4,
    factor: 0.000001,
    unit: "m/s",
  },
  {
    id: 0x45,
    label: "temperature",
    signed: true,
    size: 2,
    factor: 0.1,
    unit: "C",
  },
  {
    id: 0x02,
    label: "temperature",
    signed: true,
    size: 2,
    factor: 0.01,
    unit: "C",
  },
  {
    id: 0x13,
    label: "tvoc",
    signed: false,
    size: 2,
    unit: "ug/m3",
  },
  {
    id: 0x0c,
    label: "voltage",
    signed: false,
    size: 2,
    factor: 0.001,
    unit: "V",
  },
  {
    id: 0x4a,
    label: "voltage",
    signed: false,
    size: 2,
    factor: 0.1,
    unit: "V",
  },
  {
    id: 0x4e,
    label: "volume",
    signed: false,
    size: 4,
    factor: 0.001,
    unit: "L",
  },
  {
    id: 0x47,
    label: "volume",
    signed: false,
    size: 2,
    factor: 0.1,
    unit: "L",
  },
  {
    id: 0x48,
    label: "volume",
    signed: false,
    size: 2,
    unit: "mL",
  },
  {
    id: 0x49,
    label: "volume Flow Rate",
    signed: false,
    size: 2,
    factor: 0.001,
    unit: "m3/hr",
  },
  {
    id: 0x46,
    label: "UV index",
    signed: false,
    size: 1,
    factor: 0.1,
  },
  {
    id: 0x4f,
    label: "water",
    signed: false,
    size: 4,
    factor: 0.001,
    unit: "L",
  },
  {
    id: 0x55,
    label: "volume storage",
    signed: false,
    size: 4,
    factor: 0.001,
    unit: "L",
  },
  {
    id: 0x56,
    label: "conductivity",
    signed: false,
    size: 2,
    unit: "µS/cm",
  },
  {
    id: 0x57,
    label: "temperature",
    signed: true,
    size: 1,
    unit: "C",
  },
  {
    id: 0x58,
    label: "temperature",
    signed: true,
    size: 1,
    factor: 0.35,
    unit: "C",
  },
  { id: 0x59, label: "count", signed: true, size: 1 },
  { id: 0x5a, label: "count", signed: true, size: 2 },
  { id: 0x5b, label: "count", signed: true, size: 4 },
  {
    id: 0x5c,
    label: "power",
    signed: true,
    size: 4,
    factor: 0.01,
    unit: "W",
  },
  {
    id: 0x5d,
    label: "current",
    signed: true,
    size: 2,
    factor: 0.001,
    unit: "A",
  },
  {
    id: 0x5e,
    label: "direction",
    signed: false,
    size: 2,
    factor: 0.01,
    unit: "°",
  },
  {
    id: 0x5f,
    label: "precipitation",
    signed: false,
    size: 2,
    factor: 0.1,
    unit: "mm",
  },
  { id: 0x60, label: "channel", signed: false, size: 1 },
  {
    id: 0x61,
    label: "rotational speed",
    signed: false,
    size: 2,
    unit: "rpm",
  },
];
const multilevelSensorDefinitions = new Map(
  multilevelSensorsArray.map((def) => [def.id, def])
);
const binarySensorsArray = [
  { id: 0x15, label: "battery", states: { false: "Normal", true: "Low" } },
  {
    id: 0x16,
    label: "battery charging",
    states: { false: "Not Charging", true: "Charging" },
  },
  {
    id: 0x17,
    label: "carbon monoxide",
    states: { false: "Not detected", true: "Detected" },
  },
  { id: 0x18, label: "cold", states: { false: "Normal", true: "Cold" } },
  {
    id: 0x19,
    label: "connectivity",
    states: { false: "Disconnected", true: "Connected" },
  },
  { id: 0x1a, label: "door", states: { false: "Closed", true: "Open" } },
  {
    id: 0x1b,
    label: "garage door",
    states: { false: "Closed", true: "Open" },
  },
  { id: 0x1c, label: "gas", states: { false: "Clear", true: "Detected" } },
  {
    id: 0x0f,
    label: "generic boolean",
    states: { false: "Off", true: "On" },
  },
  { id: 0x1d, label: "heat", states: { false: "Normal", true: "Hot" } },
  {
    id: 0x1e,
    label: "light",
    states: { false: "No light", true: "Light detected" },
  },
  { id: 0x1f, label: "lock", states: { false: "Locked", true: "Unlocked" } },
  { id: 0x20, label: "moisture", states: { false: "Dry", true: "Wet" } },
  { id: 0x21, label: "motion", states: { false: "Clear", true: "Detected" } },
  {
    id: 0x22,
    label: "moving",
    states: { false: "Not moving", true: "Moving" },
  },
  {
    id: 0x23,
    label: "occupancy",
    states: { false: "Clear", true: "Detected" },
  },
  { id: 0x11, label: "opening", states: { false: "Closed", true: "Open" } },
  {
    id: 0x24,
    label: "plug",
    states: { false: "Unplugged", true: "Plugged in" },
  },
  { id: 0x10, label: "power", states: { false: "Off", true: "On" } },
  { id: 0x25, label: "presence", states: { false: "Away", true: "Home" } },
  { id: 0x26, label: "problem", states: { false: "OK", true: "Problem" } },
  {
    id: 0x27,
    label: "running",
    states: { false: "Not Running", true: "Running" },
  },
  { id: 0x28, label: "safety", states: { false: "Unsafe", true: "Safe" } },
  { id: 0x29, label: "smoke", states: { false: "Clear", true: "Detected" } },
  { id: 0x2a, label: "sound", states: { false: "Clear", true: "Detected" } },
  { id: 0x2b, label: "tamper", states: { false: "Off", true: "On" } },
  {
    id: 0x2c,
    label: "vibration",
    states: { false: "Clear", true: "Detected" },
  },
  { id: 0x2d, label: "window", states: { false: "Closed", true: "Open" } },
];
const binarySensorDefinitions = new Map(
  binarySensorsArray.map((def) => [def.id, def])
);

/** @type {Decoder} */
export const decoder = {
  decoderName: "bthome",
  name: null,
  serviceUUID: "fcd2",
  advertisementDecode: decodeBTHome,
  units:
    "Values will be in the appropriate units based on documentation: https://bthome.io/format/",
};

/** @type Test[] */
export const tests = [
  {
    // servicedata decode test. Given the servicedata data, it should decode to the expected values.
    given: {
      // DIY sensor https://github.com/mhaberler/BTHomeV2-ESP32-example.git#9f34e42b9c3b039718b67da57ea02e7fa0d11417
      serviceData: { fcd2: "403a013c020653034142435403313233" },
    },
    expected: {
      button: "press",
      dimmerRotateRight: 6,
      text: "ABC",
      raw: "313233",
    },
  },
  {
    given: {
      serviceData: { fcd2: "40000902ac0d03a00f04f28f0105d91300100112b804" },
    },
    expected: {
      packetId: 9,
      temperature_C: 35,
      humidity_percent: 40,
      pressure_hPa: 1023.86,
      illuminance_lux: 50.81,
      power: true,
      co2_ppm: 1208,
    },
  },
  {
    given: {
      // idle Shelly BLU
      serviceData: { fcd2: "4400ca01643a00" },
    },
    expected: {
      packetId: 202,
      battery_percent: 100,
    },
  },
  {
    given: {
      //  DIY sensor extended advertising with pid
      serviceData: {
        fcd2: "40004a03a00f04f28f015312424c41424c4164646164617364617358595a5403313233",
      },
    },
    expected: {
      packetId: 74,
      humidity_percent: 40,
      pressure_hPa: 1023.86,
      text: "BLABLAddadasdasXYZ",
      raw: "313233",
    },
  },
  {
    given: {
      //  DIY sensor extended advertising with pid and mac
      serviceData: {
        fcd2: "4248ca433932a5002f03a00f04f28f015312424c41424c4164646164617364617358595a5403313233",
      },
    },
    expected: {
      macAddress: "a5:32:39:43:ca:48",
      packetId: 47,
      humidity_percent: 40,
      pressure_hPa: 1023.86,
      text: "BLABLAddadasdasXYZ",
      raw: "313233",
    },
  },
  {
    given: {
      //  DIY sensor extended advertising with pid and mac, lots of fields
      serviceData: {
        fcd2: "4248ca433932a5002c02ac0d03a00f04f28f0105d91300100112b804135e013a013c02065312424c41424c4164646164617364617358595a5403313233",
      },
    },
    expected: {
      macAddress: "a5:32:39:43:ca:48",
      packetId: 44,
      temperature_C: 35,
      humidity_percent: 40,
      pressure_hPa: 1023.86,
      illuminance_lux: 50.81,
      power: true,
      co2_ppm: 1208,
      "tvoc_ug/m3": 350,
      button: "press",
      dimmerRotateRight: 6,
      text: "BLABLAddadasdasXYZ",
      raw: "313233",
    },
  },
  { // testcase from manual https://bthome.io/format/
    given: {
      serviceData: { fcd2: "44f00100f100010204f2000106" },
    },
    expected: {
      devicetype: 1, fwversion4: '4.2.1.0', fwversion3: '6.1.0'
    },
  },
  { // test signed speed and acceleration
    given: {
      serviceData: { fcd2: "40624099dfff630057d0ff" },
    },
    expected: {
      'speed_m/s': -2.123456, 'acceleration_m/s²': -3.123456
    }
  },
  { // shelly window sensor
    given: {
      serviceData: { fcd2: "4400f00164055802002d003f0000" },
    },
    expected: {
      packetId: 240,
      battery_percent: 100,
      illuminance_lux: 6,
      window: false,
      'rotation_°': 0
    }
  },

];


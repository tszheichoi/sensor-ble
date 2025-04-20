/**
 * Decodes BTHome servicedata.
 * @param {Buffer} serviceData - The data buffer to decode.
 * @returns {SensorValues} A key-value map of decoded sensor values.
 *
 * based mostly on code copyright (c) 2017-2025 AlCalzone
 * https://github.com/AlCalzone/ioBroker.ble.git
 * MIT license
 */
function decodeBTHome(data) {
  if (
    data.length < 7 || // too short
    data[0] & 0x01 || // encrypted data not supported
    ((data[0] & 0x60) >> 5) != 2 // not BTHome v2
  ) {
    return null;
  }
  const mac_included = ((data[0] & 0x02) != 0);
  let mac_address = null;
  let packetId = null;
  if (mac_included) {
    mac_address = data.slice(1, 7).reverse().toString("hex").match(/.{1,2}/g)?.join(":");
    data = data.slice(7);
  } else {
    data = data.slice(1);
  }
  const multilevelSensors = [];
  const binarySensors = [];
  const specialSensors = [];
  const events = [];
  while (data.length > 0) {
    const objectId = data[0];
    if (objectId === 0x00) {
      packetId = data[1];
      data = data.slice(2);
    }
    else if (multilevelSensorDefinitions.has(objectId)) {
      const def = multilevelSensorDefinitions.get(objectId);
      let value = def.signed
        ? data.readIntLE(1, def.size)
        : data.readUIntLE(1, def.size);
      if (def.factor) {
        value *= def.factor;
      }
      const sensorData = {
        label: def.label,
        value,
      };
      if (def.unit) {
        sensorData.unit = def.unit;
      }
      multilevelSensors.push(sensorData);
      data = data.slice(1 + def.size);
    }
    else if (binarySensorDefinitions.has(objectId)) {
      const def = binarySensorDefinitions.get(objectId);
      const sensorData = {
        label: def.label,
        value: data[1] === 0x01,
        // states: JSON.stringify(def.states), // gross haque
        states: def.states,
      };
      binarySensors.push(sensorData);
      data = data.slice(2);
    }
    else if (objectId === 0x3a) {
      // button event
      const eventId = data[1];
      const event = {
        type: "button",
      };
      if (eventId !== 0x00) {
        event.event = [
          "press",
          "double_press",
          "triple_press",
          "long_press",
          "long_double_press",
          "long_triple_press",
        ][eventId - 1];
      }
      events.push(event);
      data = data.slice(2);
    }
    else if (objectId === 0x3c) {
      // button event
      const eventId = data[1];
      const event = {
        type: "dimmer",
      };
      if (eventId !== 0x00) {
        event.event = {
          // @ts-expect-error
          event: ["rotate left", "rotate right"][eventId - 1],
          steps: data[2],
        };
      }
      events.push(event);
      data = data.slice(3);
    }
    else if (objectId === 0x50) {
      // unix timestamp UTC
      const timestamp = data.readUInt32LE(1);
      specialSensors.push({
        type: "timestamp",
        value: new Date(timestamp * 1000),
      });
      data = data.slice(5);
    }
    else if (objectId === 0x53) {
      // text sensor (utf8)
      const length = data[1];
      const value = data.slice(2, 2 + length).toString("utf8");
      specialSensors.push({
        type: "text",
        value,
      });
      data = data.slice(2 + length);
    }
    else if (objectId === 0x54) {
      // raw sensor
      const length = data[1];
      const value = data.slice(2, 2 + length);
      specialSensors.push({
        type: "raw",
        value: value.toString('hex'),
      });
      data = data.slice(2 + length);
    }
    else {
      console.log(`Unsupported BTHome object ID ${objectId.toString(16)}`);
      return {};
    }
  }
  return {
    ...(packetId != null ? { packetId } : {}),
    ...(mac_address != null ? { mac_address } : {}),
    multilevelSensors,
    binarySensors,
    specialSensors,
    events,
  };
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
    id: 0x01,
    label: "battery",
    signed: false,
    size: 1,
    unit: "%",
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
    unit: "%",
  },
  {
    id: 0x2e,
    label: "humidity",
    signed: false,
    size: 1,
    unit: "%",
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
    unit: "%",
  },
  {
    id: 0x2f,
    label: "moisture",
    signed: false,
    size: 1,
    unit: "%",
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
    id: 0x45,
    label: "temperature",
    signed: true,
    size: 2,
    factor: 0.1,
    unit: "°C",
  },
  {
    id: 0x02,
    label: "temperature",
    signed: true,
    size: 2,
    factor: 0.01,
    unit: "°C",
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
];
const multilevelSensorDefinitions = new Map(multilevelSensorsArray.map((def) => [def.id, def]));
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
const binarySensorDefinitions = new Map(binarySensorsArray.map((def) => [def.id, def]));

/** @type {Decoder} */
export const decoder = {
  decoderName: "bthome",
  name: null,
  serviceUUID: "fcd2",
  servicedataDecode: decodeBTHome,
  units:
    "Values will be in the appropriate units based on documentation: https://bthome.io/format/",
  plottables: {
    // can only be determined at runtime after parsing an ad from a particular device
    // also, valid only for the particular device
  },
};

/** @type Test[] */
export const tests = [
  {
    // servicedata decode test. Given the servicedata data, it should decode to the expected values.
    given: {
      // DIY sensor https://github.com/mhaberler/BTHomeV2-ESP32-example.git#9f34e42b9c3b039718b67da57ea02e7fa0d11417
      serviceData: "403a013c020653034142435403313233",
    },
    expected: {
      multilevelSensors: [],
      binarySensors: [],
      specialSensors: [{ type: 'text', value: 'ABC' }, { type: 'raw', value: '313233' }],
      events: [
        { type: 'button', event: 'press' },
        { type: 'dimmer', event: { event: 'rotate right', steps: 6 } }
      ]
    },
  },
  {
    given: {
      serviceData: "40000902ac0d03a00f04f28f0105d91300100112b804",
    },
    expected: {
      "packetId": 9,
      "multilevelSensors": [
        {
          "label": "temperature",
          "value": 35,
          "unit": "°C"
        },
        {
          "label": "humidity",
          "value": 40,
          "unit": "%"
        },
        {
          "label": "pressure",
          "value": 1023.86,
          "unit": "hPa"
        },
        {
          "label": "illuminance",
          "value": 50.81,
          "unit": "lux"
        },
        {
          "label": "co2",
          "value": 1208,
          "unit": "ppm"
        }
      ],
      "binarySensors": [
        {
          "label": "power",
          "value": true,
          "states": {
            "false": "Off",
            "true": "On"
          }
        }
      ],
      "specialSensors": [],
      "events": []
    },
  },
  {
    given: {
      // idle Shelly BLU
      serviceData: "4400ca01643a00",
    },
    expected: {
      packetId: 202,
      multilevelSensors: [{ label: 'battery', value: 100, unit: '%' }],
      binarySensors: [],
      specialSensors: [],
      events: [{ type: 'button' }]
    }
  },
  {
    given: {
      //  DIY sensor extended advertising with pid
      serviceData: "40004a03a00f04f28f015312424c41424c4164646164617364617358595a5403313233",
    },
    expected: {
      packetId: 74,
      multilevelSensors: [
        { label: 'humidity', value: 40, unit: '%' },
        { label: 'pressure', value: 1023.86, unit: 'hPa' }
      ],
      binarySensors: [],
      specialSensors: [
        { type: 'text', value: 'BLABLAddadasdasXYZ' },
        { type: 'raw', value: '313233' }
      ],
      events: []
    }
  },
  {
    given: {
      //  DIY sensor extended advertising with pid and mac
      serviceData: "4248ca433932a5002f03a00f04f28f015312424c41424c4164646164617364617358595a5403313233",
    },
    expected: {
      packetId: 47,
      mac_address: 'a5:32:39:43:ca:48',
      multilevelSensors: [
        { label: 'humidity', value: 40, unit: '%' },
        { label: 'pressure', value: 1023.86, unit: 'hPa' }
      ],
      binarySensors: [],
      specialSensors: [
        { type: 'text', value: 'BLABLAddadasdasXYZ' },
        { type: 'raw', value: '313233' }
      ],
      events: []
    },
  },
  {
    given: {
      //  DIY sensor extended advertising with pid and mac, lots of fields
      serviceData: "4248ca433932a5002c02ac0d03a00f04f28f0105d91300100112b804135e013a013c02065312424c41424c4164646164617364617358595a5403313233",
    },
    expected: {
      "packetId": 44,
      "mac_address": "a5:32:39:43:ca:48",
      "multilevelSensors": [
        {
          "label": "temperature",
          "value": 35,
          "unit": "°C"
        },
        {
          "label": "humidity",
          "value": 40,
          "unit": "%"
        },
        {
          "label": "pressure",
          "value": 1023.86,
          "unit": "hPa"
        },
        {
          "label": "illuminance",
          "value": 50.81,
          "unit": "lux"
        },
        {
          "label": "co2",
          "value": 1208,
          "unit": "ppm"
        },
        {
          "label": "tvoc",
          "value": 350,
          "unit": "ug/m3"
        }
      ],
      "binarySensors": [
        {
          "label": "power",
          "value": true,
          "states": {
            "false": "Off",
            "true": "On"
          }
        }
      ],
      "specialSensors": [
        {
          "type": "text",
          "value": "BLABLAddadasdasXYZ"
        },
        {
          "type": "raw",
          "value": "313233"
        }
      ],
      "events": [
        {
          "type": "button",
          "event": "press"
        },
        {
          "type": "dimmer",
          "event": {
            "event": "rotate right",
            "steps": 6
          }
        }
      ]
    },
  },

];


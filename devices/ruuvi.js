/**
 * Decodes RuuviTag manufacturer data.
 * @param {Buffer} manufacturerData - The manufacturer data buffer to decode.
 * @returns {SensorValues} A key-value map of decoded sensor values.
 */
function decodeRuuviTags(manufacturerData) {
  if (
    manufacturerData[0] !== 0x99 ||
    manufacturerData[1] !== 0x04 ||
    manufacturerData[2] !== 0x05
  ) {
    // Not RuuviTag V5
    return null;
  }

  const data = manufacturerData.subarray(3);

  const temperatureRaw = data.readInt16BE(0);
  const temperature = temperatureRaw === 0x8000 ? null : temperatureRaw * 0.005;

  const humidityRaw = data.readUInt16BE(2);
  const humidity = humidityRaw === 0xffff ? null : humidityRaw * 0.0025;

  const pressureRaw = data.readUInt16BE(4);
  const pressure = pressureRaw === 0xffff ? null : pressureRaw + 50000;

  const accelerationXRaw = data.readInt16BE(6);
  const accelerationX = accelerationXRaw === 0x8000 ? null : accelerationXRaw;

  const accelerationYRaw = data.readInt16BE(8);
  const accelerationY = accelerationYRaw === 0x8000 ? null : accelerationYRaw;

  const accelerationZRaw = data.readInt16BE(10);
  const accelerationZ = accelerationZRaw === 0x8000 ? null : accelerationZRaw;

  const powerInfoRaw = data.readUInt16BE(12);
  const voltageRaw = powerInfoRaw >> 5;
  const voltage = voltageRaw === 0x07ff ? null : 1600 + voltageRaw;
  const txPowerRaw = powerInfoRaw & 0x1f;
  const txPower = txPowerRaw === 0x1f ? null : -40 + txPowerRaw * 2;

  const movementCounter = data.readUInt8(14);
  const movement = movementCounter === 0xff ? null : movementCounter;

  const measurementSequenceRaw = data.readUInt16BE(15);
  const measurementSequence =
    measurementSequenceRaw === 0xffff ? null : measurementSequenceRaw;

  const macAddress = data
    .slice(17, 23)
    .toString("hex")
    .match(/.{1,2}/g)
    ?.join(":");

  return {
    temperature,
    humidity,
    pressure,
    accel_x: accelerationX,
    accel_y: accelerationY,
    accel_z: accelerationZ,
    voltage,
    txPower,
    movement,
    measurementSequence,
    macAddress,
  };
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "ruuvi",
  name: null,
  manufacturer: "9904",
  advertisementDecode: decodeRuuviTags,
  units:
    "Values will be in the appropriate units based on documentation: https://github.com/ruuvi/ruuvi-sensor-protocols/blob/master/dataformat_05.md",
  plottables: {
    Acceleration: {
      unit: "mg",
      fields: ["accel_x", "accel_y", "accel_z"],
    },
    Temperature: {
      unit: "°C",
      fields: ["temperature"],
    },
    Humidity: {
      unit: "%",
      fields: ["humidity"],
    },
    Pressure: {
      unit: "Pa",
      fields: ["pressure"],
    },
    Voltage: {
      unit: "mV",
      fields: ["voltage"],
    },
    TxPower: {
      unit: "dBm",
      fields: ["txPower"],
    },
    Movement: {
      unit: null,
      fields: ["movement"],
    },
    MeasurementSequence: {
      unit: null,
      fields: ["measurementSequence"],
    },
  },
};

/** @type Test[] */
export const tests = [
  {
    // Advertisement data test. Given the manufacturer data, it should decode to the expected values.
    given: {
      manufacturerData: "99040512FC5394C37C0004FFFC040CAC364200CDCBB8334C884F",
    },
    expected: {
      temperature: 24.3,
      humidity: 53.49,
      pressure: 100044,
      accel_x: 4,
      accel_y: -4,
      accel_z: 1036,
      voltage: 2977,
      txPower: 4,
      movement: 66,
      measurementSequence: 205,
      macAddress: "cb:b8:33:4c:88:4f",
    },
  },
  {
    given: {
      manufacturerData: "990405138effffffff0000ffdc03f09f169de950c50782d95bc7",
    },
    expected: {
      temperature: 25.03,
      humidity: null,
      pressure: null,
      accel_x: 0,
      accel_y: -36,
      accel_z: 1008,
      voltage: 2872,
      txPower: 4,
      movement: 157,
      measurementSequence: 59728,
      macAddress: "c5:07:82:d9:5b:c7",
    },
  },
];

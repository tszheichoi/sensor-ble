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

  const data = manufacturerData.slice(3);

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
    temperature_C: temperature,
    humidity_percent: humidity,
    pressure_Pa: pressure,
    acceleration_x_mg: accelerationX,
    acceleration_y_mg: accelerationY,
    acceleration_z_mg: accelerationZ,
    voltage_mV: voltage,
    txPower_dBm: txPower,
    movement_dimensionless: movement,
    measurementSequence_dimensionless: measurementSequence,
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
};

/** @type Test[] */
export const tests = [
  {
    // Advertisement data test. Given the manufacturer data, it should decode to the expected values.
    given: {
      manufacturerData: "99040512FC5394C37C0004FFFC040CAC364200CDCBB8334C884F",
    },
    expected: {
      temperature_C: 24.3,
      humidity_percent: 53.49,
      pressure_Pa: 100044,
      acceleration_x_mg: 4,
      acceleration_y_mg: -4,
      acceleration_z_mg: 1036,
      voltage_mV: 2977,
      txPower_dBm: 4,
      movement_dimensionless: 66,
      measurementSequence_dimensionless: 205,
      macAddress: "cb:b8:33:4c:88:4f",
    },
  },
  {
    given: {
      manufacturerData: "990405138effffffff0000ffdc03f09f169de950c50782d95bc7",
    },
    expected: {
      temperature_C: 25.03,
      humidity_percent: null,
      pressure_Pa: null,
      acceleration_x_mg: 0,
      acceleration_y_mg: -36,
      acceleration_z_mg: 1008,
      voltage_mV: 2872,
      txPower_dBm: 4,
      movement_dimensionless: 157,
      measurementSequence_dimensionless: 59728,
      macAddress: "c5:07:82:d9:5b:c7",
    },
  },
];

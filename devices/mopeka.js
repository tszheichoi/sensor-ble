/**
 * Decodes Mopeka manufacturer data.
 * @param {Buffer} manufacturerData - The manufacturer data buffer to decode.
 * @returns {SensorValues} A key-value map of decoded sensor values.
 */


const MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_0 = 0.573045;
const MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_1 = -0.002822;
const MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_2 = -0.00000535;

function decodeMopeka(manufacturerData) {
  if (
    manufacturerData[0] !== 0x59 ||
    manufacturerData[1] !== 0x00 ||
    manufacturerData.byteLength != 12
  ) {
    // Not Mopeka
    return null;
  }

  const voltage_mV = (manufacturerData.readUInt8(3) & 0x7f) / 32.0;
  const bits = manufacturerData.readUInt8(4);

  const syncPressed_dimensionless = (bits & 0x80) > 0;
  const raw_temp = (bits & 0x7f);
  const temperature_C = raw_temp - 40; // °C
  const qualityStars_dimensionless = (manufacturerData.readUint8(6) >> 6);

  const acceleration_x_mg = manufacturerData.readUint8(10);
  const acceleration_y_mg = manufacturerData.readUint8(11);

  const rawLevel_mm = manufacturerData.readUInt16LE(5) & 0x3fff;

  const temperatureFactor = MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_0 +
    (MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_1 * temperature_C) +
    (MOPEKA_TANK_LEVEL_COEFFICIENTS_PROPANE_2 * temperature_C * temperature_C);
  const propaneLevel_mm = Math.round(rawLevel_mm * temperatureFactor * 100) / 100;

  const macAddress = manufacturerData
    .slice(7, 10)
    .toString("hex")
    .match(/.{1,2}/g)
    ?.join(":");

  return {
    voltage_mV,
    syncPressed_dimensionless,
    temperature_C,
    qualityStars_dimensionless,
    acceleration_x_mg,
    acceleration_y_mg,
    rawLevel_mm,
    propaneLevel_mm,
    macAddress
  };
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "mopeka",
  name: null,
  manufacturer: "5900",
  serviceUUID: "fee5",
  advertisementDecode: decodeMopeka,
  units:
    "Values will be in the appropriate units based on documentation: https://github.com/ruuvi/ruuvi-sensor-protocols/blob/master/dataformat_05.md",
};

/** @type Test[] */
export const tests = [
  {
    // Advertisement data test. Given the manufacturer data, it should decode to the expected values.
    given: {
      manufacturerData: "590003444200006e8d17cd84",
    },
    expected: {
      voltage_mV: 2.125,
      syncPressed_dimensionless: false,
      temperature_C: 26,
      qualityStars_dimensionless: 0,
      acceleration_x_mg: 205,
      acceleration_y_mg: 132,
      rawLevel_mm: 0,
      propaneLevel_mm: 0,
      macAddress: '6e:8d:17'
    },
  },
  {
    given: {
      manufacturerData: "59000c543573c8f2eb441413",
    },
    expected: {
      voltage_mV: 2.625,
      syncPressed_dimensionless: false,
      temperature_C: 13,
      qualityStars_dimensionless: 3,
      acceleration_x_mg: 20,
      acceleration_y_mg: 19,
      rawLevel_mm: 2163,
      propaneLevel_mm: 1158.19,
      macAddress: 'f2:eb:44'
    },
  },
];

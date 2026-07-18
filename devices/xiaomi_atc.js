// Xiaomi thermometers (LYWSD03MMC etc.) with ATC1441 or pvvx custom firmware.
// Both broadcast in service data on UUID 0x181A, distinguished by length:
//   ATC1441 (13 bytes, big-endian): MAC + temp(0.1C) + humidity + battery% + battery(mV) + counter
//   pvvx    (15 bytes, little-endian, MAC reversed): MAC + temp(0.01C) + humidity(0.01%) + battery(mV) + battery% + counter + flags
// https://github.com/pvvx/ATC_MiThermometer

const SERVICE_UUID = "181a";

function formatMac(bytes) {
  return bytes.toString("hex").match(/.{1,2}/g).join(":");
}

function decodeXiaomiAtc(_manufacturerData, serviceData) {
  const data = serviceData?.[SERVICE_UUID];
  if (!data) return null;

  if (data.length === 13) {
    return {
      macAddress: formatMac(data.slice(0, 6)),
      temperature_C: data.readInt16BE(6) / 10,
      humidity_percent: data.readUInt8(8),
      battery_percent: data.readUInt8(9),
      batteryVoltage_mV: data.readUInt16BE(10),
      frameCounter_dimensionless: data.readUInt8(12),
    };
  }

  if (data.length === 15) {
    return {
      macAddress: formatMac(Buffer.from(data.slice(0, 6)).reverse()),
      temperature_C: data.readInt16LE(6) / 100,
      humidity_percent: data.readUInt16LE(8) / 100,
      batteryVoltage_mV: data.readUInt16LE(10),
      battery_percent: data.readUInt8(12),
      frameCounter_dimensionless: data.readUInt8(13),
    };
  }

  // Unknown length (e.g. encrypted variant or a genuine ESS device)
  return null;
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "xiaomi_atc",
  name: "ATC",
  manufacturer: null,
  serviceUUID: SERVICE_UUID,
  advertisementDecode: decodeXiaomiAtc,
  units:
    "Temperature in °C, humidity in %, battery in % and mV. Frame counter increments per " +
    "broadcast. See https://github.com/pvvx/ATC_MiThermometer",
  frequency: "Advertisement, typically every ~2.5s (firmware default).",
};

/** @type {Test[]} */
export const tests = [
  {
    // ATC1441
    given: { serviceData: { "181a": "a4c1382f6b8e00eb2d5d0bc464" } },
    expected: {
      macAddress: "a4:c1:38:2f:6b:8e",
      temperature_C: 23.5,
      humidity_percent: 45,
      battery_percent: 93,
      batteryVoltage_mV: 3012,
      frameCounter_dimensionless: 100,
    },
  },
  {
    // ATC1441, negative temperature
    given: { serviceData: { "181a": "a4c1382f6b8effc92d5d0bc464" } },
    expected: {
      macAddress: "a4:c1:38:2f:6b:8e",
      temperature_C: -5.5,
      humidity_percent: 45,
      battery_percent: 93,
      batteryVoltage_mV: 3012,
      frameCounter_dimensionless: 100,
    },
  },
  {
    // pvvx
    given: { serviceData: { "181a": "8e6b2f38c1a42e09c611c40b5d6404" } },
    expected: {
      macAddress: "a4:c1:38:2f:6b:8e",
      temperature_C: 23.5,
      humidity_percent: 45.5,
      batteryVoltage_mV: 3012,
      battery_percent: 93,
      frameCounter_dimensionless: 100,
    },
  },
  {
    // pvvx, negative temperature
    given: { serviceData: { "181a": "8e6b2f38c1a4effcc611c40b5d6404" } },
    expected: {
      macAddress: "a4:c1:38:2f:6b:8e",
      temperature_C: -7.85,
      humidity_percent: 45.5,
      batteryVoltage_mV: 3012,
      battery_percent: 93,
      frameCounter_dimensionless: 100,
    },
  },
  {
    // unknown length ignored
    given: { serviceData: { "181a": "a4c1382f6b8e00eb" } },
    expected: null,
  },
];

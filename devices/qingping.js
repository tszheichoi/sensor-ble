const DEVICE_TYPES = {
  0x01: "CGG1",
  0x04: "CGH1",
  0x07: "CGG1",
  0x09: "CGP1W",
  0x0C: "CGD1",
  0x0E: "CGDN1",
  0x12: "CGPR1",
};

function decodeQingping(_manufacturerData, serviceData) {
  const buf = serviceData?.["fdcd"];
  if (!buf || buf.length < 8) return null;

  const deviceId = buf[1];
  if (!DEVICE_TYPES[deviceId]) return null;

  const result = {};

  // TLV records start at buf[8]
  let off = 8;
  while (off + 2 <= buf.length) {
    const id = buf[off];
    const size = buf[off + 1];
    off += 2;
    if (off + size > buf.length) break;
    const d = buf.slice(off, off + size);
    if (id === 0x04 && size === 1) {
      result.open_dimensionless = d[0] === 0 ? 1 : 0;
    } else if (id === 0x01 && size === 4) {
      result.temperature_C = d.readInt16LE(0) / 10;
      result.humidity_percent = d.readUInt16LE(2) / 10;
    } else if (id === 0x02 && size === 1) {
      result.battery_percent = d[0];
    } else if (id === 0x07 && size === 2) {
      result.pressure_hPa = d.readUInt16LE(0) / 10;
    } else if (id === 0x08 && size === 4) {
      const motion = d[0];
      result.motion_dimensionless = motion;
      result.illuminance_lux = d.readUInt16LE(1) + d[3];
      if (motion) result.motionTimer_dimensionless = 1;
    } else if (id === 0x09 && size === 4) {
      result.illuminance_lux = d.readUInt32LE(0);
    } else if (id === 0x11 && size === 1) {
      result.light_dimensionless = d[0];
    } else if (id === 0x12 && size === 4) {
      result.pm2_5_ugm3 = d.readUInt16LE(0);
      result.pm10_ugm3 = d.readUInt16LE(2);
    } else if (id === 0x13 && size === 2) {
      result.co2_ppm = d.readUInt16LE(0);
    }
    off += size;
  }

  // CGH1 long format (17 bytes): contact state in last byte, 0=open, 1=closed
  if (deviceId === 0x04 && buf.length === 17 && result.open_dimensionless === undefined) {
    result.open_dimensionless = buf[16] === 0 ? 1 : 0;
  }

  if (deviceId === 0x04) {
    result.macAddress = [...buf.slice(2, 8)].reverse().map(b => b.toString(16).padStart(2, "0")).join(":");
  }

  return result;
}

/** @type {import('../types.js').Decoder} */
export const decoder = {
  decoderName: "qingping",
  serviceUUID: "fdcd",
  advertisementDecode: decodeQingping,
  variableFormat: true,
};

/** @type {import('../types.js').Test[]} */
export const tests = [
  {
    // CGP1W: temperature, humidity, pressure, battery
    given: { serviceData: { fdcd: "08096f1c40342d580104be000d0207027226020157" } },
    expected: {
      temperature_C: 19,
      humidity_percent: 52.5,
      pressure_hPa: 984.2,
      battery_percent: 87,
    },
  },
  {
    // CGD1: temperature, humidity, battery
    given: { serviceData: { fdcd: "080cbf6552342d580104f100ad01020125" } },
    expected: {
      temperature_C: 24.1,
      humidity_percent: 42.9,
      battery_percent: 37,
    },
  },
  {
    // CGG1: temperature, humidity, battery
    given: { serviceData: { fdcd: "0807b24410342d580104ca004502020138" } },
    expected: {
      temperature_C: 20.2,
      humidity_percent: 58.1,
      battery_percent: 56,
    },
  },
  {
    // CGPR1: battery + illuminance (0x09 TLV)
    given: { serviceData: { fdcd: "0812005e60342d580201640f011c09048b090000" } },
    expected: {
      battery_percent: 100,
      illuminance_lux: 2443,
    },
  },
  {
    // CGPR1: motion=0 + illuminance (0x08 TLV)
    given: { serviceData: { fdcd: "4812005e60342d580804008b09000f0122" } },
    expected: {
      motion_dimensionless: 0,
      illuminance_lux: 2443,
    },
  },
  {
    // CGPR1: light level (0x11 TLV)
    given: { serviceData: { fdcd: "4812005e60342d581101010f0130" } },
    expected: {
      light_dimensionless: 1,
    },
  },
  {
    // CGDN1: temperature, humidity, PM2.5, PM10, CO2
    given: { serviceData: { fdcd: "080ea3808fe64854010422014c011204710072001302ed03" } },
    expected: {
      temperature_C: 29,
      humidity_percent: 33.2,
      pm2_5_ugm3: 113,
      pm10_ugm3: 114,
      co2_ppm: 1005,
    },
  },
  {
    // CGH1: long format (17 bytes), open, battery
    given: { serviceData: { fdcd: "0804ffeeddccbbaa0201600f012b0f0100" } },
    expected: {
      battery_percent: 96,
      open_dimensionless: 1,
      macAddress: "aa:bb:cc:dd:ee:ff",
    },
  },
  {
    // CGH1: long format (17 bytes), closed, battery
    given: { serviceData: { fdcd: "0804751060342d580201600f01420f0101" } },
    expected: {
      battery_percent: 96,
      open_dimensionless: 0,
      macAddress: "58:2d:34:60:10:75",
    },
  },
  {
    // CGH1: short format (14 bytes), open action
    given: { serviceData: { fdcd: "4804751060342d580401000f01cb" } },
    expected: {
      open_dimensionless: 1,
      macAddress: "58:2d:34:60:10:75",
    },
  },
  {
    // CGH1: short format (14 bytes), close action
    given: { serviceData: { fdcd: "4804751060342d580401010f01d5" } },
    expected: {
      open_dimensionless: 0,
      macAddress: "58:2d:34:60:10:75",
    },
  },
];

function decodeMikrotik(manufacturerData) {
  if (manufacturerData.length !== 20) return null;
  if (manufacturerData[0] !== 0x4f || manufacturerData[1] !== 0x09) return null;

  const p = manufacturerData.slice(2);
  let off = 0;
  const version   = p.readUInt8(off++);
  const user_data = p.readUInt8(off++);
  off += 2; // salt
  const acc_x_frac = p.readUInt8(off++);
  const acc_x      = p.readInt8(off++);
  const acc_y_frac = p.readUInt8(off++);
  const acc_y      = p.readInt8(off++);
  const acc_z_frac = p.readUInt8(off++);
  const acc_z      = p.readInt8(off++);
  const temp_frac  = p.readUInt8(off++);
  const temp       = p.readInt8(off++);
  const uptime     = p.readUInt32LE(off); off += 4;
  const flags      = p.readUInt8(off++);
  const batt       = p.readUInt8(off++) & 0x7F;

  if (user_data & 1) return null; // encrypted

  const ax = acc_x + acc_x_frac / 256;
  const ay = acc_y + acc_y_frac / 256;
  const az = acc_z + acc_z_frac / 256;
  const temperature = temp === -128 ? null : temp + temp_frac / 256;

  return {
    temperature_C:          temperature,
    acceleration_x_g:       ax,
    acceleration_y_g:       ay,
    acceleration_z_g:       az,
    acceleration_g:         Math.sqrt(ax ** 2 + ay ** 2 + az ** 2),
    uptime_s:               uptime,
    battery_percent:        batt,
    version_dimensionless:  version,
    switch_dimensionless:   flags & 1,
    tilt_dimensionless:     flags & 2,
    dropping_dimensionless: flags & 4,
    impactX_dimensionless:  flags & 8,
    impactY_dimensionless:  flags & 16,
    impactZ_dimensionless:  flags & 32,
    impact_dimensionless:   (flags & 56) ? 1 : 0,
  };
}

/** @type {import('../types.js').Decoder} */
export const decoder = {
  decoderName: "mikrotik",
  manufacturer: "4f09",
  advertisementDecode: decodeMikrotik,
};

/** @type {import('../types.js').Test[]} */
export const tests = [
  {
    // TG-BT5-IN: temp sentinel -128 -> null
    given: { manufacturerData: "4f09010010a90000fdff010000806be866000062" },
    expected: {
      temperature_C:          null,
      acceleration_x_g:       0,
      acceleration_y_g:       -0.01171875,
      acceleration_z_g:       0.00390625,
      acceleration_g:         0.012352647110032733,
      uptime_s:               6744171,
      battery_percent:        98,
      version_dimensionless:  1,
      switch_dimensionless:   0,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  0,
      impactY_dimensionless:  0,
      impactZ_dimensionless:  0,
      impact_dimensionless:   0,
    },
  },
  {
    // TG-BT5-OUT: temperature present
    given: { manufacturerData: "4f09010010a90000fdff0100a1196be866000062" },
    expected: {
      temperature_C:          25.62890625,
      acceleration_x_g:       0,
      acceleration_y_g:       -0.01171875,
      acceleration_z_g:       0.00390625,
      acceleration_g:         0.012352647110032733,
      uptime_s:               6744171,
      battery_percent:        98,
      version_dimensionless:  1,
      switch_dimensionless:   0,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  0,
      impactY_dimensionless:  0,
      impactZ_dimensionless:  0,
      impact_dimensionless:   0,
    },
  },
  {
    // sensorlog: TG-BT5-OUT real capture
    given: { manufacturerData: "4f090100c517040001000200b017996f75000064" },
    expected: {
      temperature_C:          23.6875,
      acceleration_x_g:       0.015625,
      acceleration_y_g:       0.00390625,
      acceleration_z_g:       0.0078125,
      acceleration_g:         0.01790068630842125,
      uptime_s:               7696281,
      battery_percent:        100,
      version_dimensionless:  1,
      switch_dimensionless:   0,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  0,
      impactY_dimensionless:  0,
      impactZ_dimensionless:  0,
      impact_dimensionless:   0,
    },
  },
  {
    // sensorlog: TG-BT5-IN real capture (temp null)
    given: { manufacturerData: "4f090100c10affff0100f6ff0080636e75000050" },
    expected: {
      temperature_C:          null,
      acceleration_x_g:       -0.00390625,
      acceleration_y_g:       0.00390625,
      acceleration_z_g:       -0.0390625,
      acceleration_g:         0.039451191165476865,
      uptime_s:               7695971,
      battery_percent:        80,
      version_dimensionless:  1,
      switch_dimensionless:   0,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  0,
      impactY_dimensionless:  0,
      impactZ_dimensionless:  0,
      impact_dimensionless:   0,
    },
  },
  {
    // Theengs TG-BT5-OUT: flags=0x18, batt from raw 0x5f
    given: { manufacturerData: "4f090100cea6000000000200a01c91085700185f" },
    expected: {
      temperature_C:          28.625,
      acceleration_x_g:       0,
      acceleration_y_g:       0,
      acceleration_z_g:       0.0078125,
      acceleration_g:         0.0078125,
      uptime_s:               5703825,
      battery_percent:        95,
      version_dimensionless:  1,
      switch_dimensionless:   0,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  8,
      impactY_dimensionless:  16,
      impactZ_dimensionless:  0,
      impact_dimensionless:   1,
    },
  },
  {
    // Theengs TG-BT5-OUT: negative accel, batt from raw 0xe4 (MSB=status flag, masked to 100)
    given: { manufacturerData: "4f0901009e11fffffeff0000a119e802000029e4" },
    expected: {
      temperature_C:          25.62890625,
      acceleration_x_g:       -0.00390625,
      acceleration_y_g:       -0.0078125,
      acceleration_z_g:       0,
      acceleration_g:         0.008734640537108554,
      uptime_s:               744,
      battery_percent:        100,
      version_dimensionless:  1,
      switch_dimensionless:   1,
      tilt_dimensionless:     0,
      dropping_dimensionless: 0,
      impactX_dimensionless:  8,
      impactY_dimensionless:  0,
      impactZ_dimensionless:  32,
      impact_dimensionless:   1,
    },
  },
];

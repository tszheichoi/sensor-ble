/**
 * Decodes BTHome servicedata.
 * @param {Buffer} serviceData - The data buffer to decode.
 * @returns {SensorValues} A key-value map of decoded sensor values.
 */
function decodeBTHome(serviceData) {
  if (
    serviceData.length < 9 ||
    (serviceData[0] & 0xe5) != 0x40
  ) {
    // Not BTHome V2
    return null;
  }
  // just indicate match for now
  return {
    BTHomeFound: true
  };
}

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
      BTHomeFound: true
    },
  },
  {
    given: {
      serviceData: "4002ac0d03a00f04f28f0105d91300100112b804135e01",
    },
    expected: {
      BTHomeFound: true
    },
  },
  {
    given: {
      // idle Shelly BLU
      serviceData: "4400ca01643a00",
    },
    expected: {
      BTHomeFound: true
    },
  },
];

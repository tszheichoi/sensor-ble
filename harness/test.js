import { decoders as mainDecoders } from "../main.js";
import { getDecoders } from "./registry.js";

async function run() {
  const decoders = await getDecoders();
  for (const decoderModule of decoders) {
    const { tests, decoder } = decoderModule;
    if (
      mainDecoders.find((d) => d.decoderName === decoder.decoderName) == null
    ) {
      throw new Error(
        `Decoder ${decoder.decoderName} not found in main decoders, please add it to main.js`
      );
    }
    for (const test of tests) {
      const given = test.given;
      if (decoder.advertisementDecode != null) {
        const decoded = decoder.advertisementDecode(
          processManufacturerData(given.manufacturerData),
          processServiceData(given.serviceData)
        );
        logTest(test, decoder, decoded);
      }
      if (given.data != null) {
        let mostRecentDecoded;
        decoder.start("test-device", false, {
          write: () => {},
        });
        for (const message of given.data) {
          const handler = decoder.notify.find(
            (n) =>
              n.service === message.service &&
              n.characteristic === message.characteristic
          );
          if (handler == null) {
            throw new Error(
              `No handler found for ${message.service} ${message.characteristic}`
            );
          }
          const data = Buffer.from(message.data, "hex");
          const decoded = handler.onNotification("test-device", data);
          if (decoded) {
            mostRecentDecoded = decoded;
          }
        }
        logTest(test, decoder, mostRecentDecoded);
      }
    }
  }
}

function processManufacturerData(manufacturerData) {
  if (manufacturerData == null) {
    return manufacturerData;
  }
  return Buffer.from(manufacturerData, "hex");
}

function processServiceData(serviceData) {
  if (serviceData == null) {
    return serviceData;
  }
  const processed = {};
  for (const [uuid, data] of Object.entries(serviceData)) {
    processed[uuid] = Buffer.from(data, "hex");
  }
  return processed;
}

function logTest(test, decoder, decoded) {
  const passed = JSON.stringify(decoded) === JSON.stringify(test.expected);
  if (passed) {
    console.log("Test passed", decoder.decoderName);
  } else {
    console.error("Test failed");
    console.error("Given:", test.given.data);
    console.error("Decoded:", decoded);
    console.error("Expected:", test.expected);
  }
}

run()
  .then(() => {
    console.log("All tests completed.");
  })
  .catch((error) => {
    console.error("Error:", error);
  });

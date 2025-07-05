import noble from "@abandonware/noble";
import readline from "readline";
import { getDecoders } from "./registry.js";

// Global map to store advertisements by peripheral ID
const advertisementMap = new Map();

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

function areBuffersEqual(buf1, buf2) {
  if (!buf1 && !buf2) return true;
  if (!buf1 || !buf2) return false;
  if (buf1.length !== buf2.length) return false;
  return buf1.equals(buf2);
}

function areServiceDataEqual(serviceData1, serviceData2) {
  if (!serviceData1 && !serviceData2) return true;
  if (!serviceData1 || !serviceData2) return false;
  if (serviceData1.length !== serviceData2.length) return false;

  // Create maps for easier comparison
  const map1 = new Map(serviceData1.map((sd) => [sd.uuid, sd.data]));
  const map2 = new Map(serviceData2.map((sd) => [sd.uuid, sd.data]));

  if (map1.size !== map2.size) return false;

  for (const [uuid, data] of map1) {
    const otherData = map2.get(uuid);
    if (!otherData || !areBuffersEqual(data, otherData)) {
      return false;
    }
  }

  return true;
}

function isAdvertisementDuplicate(peripheralId, advertisement) {
  const stored = advertisementMap.get(peripheralId);
  if (!stored) {
    // Store the advertisement for future comparison
    advertisementMap.set(peripheralId, {
      manufacturerData: advertisement.manufacturerData,
      serviceData: advertisement.serviceData,
    });
    return false;
  }

  // Compare manufacturerData and serviceData
  const manufacturerMatch = areBuffersEqual(
    stored.manufacturerData,
    advertisement.manufacturerData
  );
  const serviceDataMatch = areServiceDataEqual(
    stored.serviceData,
    advertisement.serviceData
  );

  if (manufacturerMatch && serviceDataMatch) {
    return true; // Duplicate found
  }

  // Update stored advertisement if different
  advertisementMap.set(peripheralId, {
    manufacturerData: advertisement.manufacturerData,
    serviceData: advertisement.serviceData,
  });

  return false;
}

async function main() {
  const decoders = await getDecoders();
  console.log("Available decoders:");
  decoders.forEach((d) => {
    console.log(`- ${d.decoder.decoderName}`);
  });

  /** @type {Decoder | undefined} */
  let decoder = null;
  let input = process.argv[2]; // Get decoder name from command line argument

  if (!input) {
    // If no command line argument, ask interactively
    input = await ask(
      "\nEnter a decoder name or press enter to scan all devices: "
    );
  }

  if (input) {
    const decoderModule = decoders.find((d) => d.decoder.decoderName === input);
    if (decoderModule) {
      decoder = decoderModule.decoder;
      console.log(`Using decoder: ${decoder.decoderName}`);
    } else {
      console.error(`\nDecoder "${input}" not found.`);
      return;
    }
  }

  noble.on("stateChange", async (state) => {
    if (state === "poweredOn") {
      if (input) {
        console.log(`Scanning for devices supporting decoder: ${input}`);
      } else {
        console.log("Scanning all devices");
      }
      await noble.startScanningAsync([], true);
    } else {
      await noble.stopScanningAsync();
      console.log("Scanning stopped");
    }
  });

  noble.on("discover", async (peripheral) => {
    // console.log(peripheral.uuid, peripheral.id);

    try {
      const { advertisement } = peripheral;

      // Check for duplicate advertisement
      // if (isAdvertisementDuplicate(peripheral.id, advertisement)) {
      //   console.log(peripheral.uuid, peripheral.id);
      //   return; // Skip duplicate advertisements
      // }

      if (decoder == null) {
        logFoundDevice(peripheral.id, advertisement);
      } else if (isDecoderValid(decoder, advertisement)) {
        if (decoder.advertisementDecode) {
          const serviceData = (advertisement.serviceData ?? []).reduce(
            (acc, sd) => {
              acc[sd.uuid] = sd.data;
              return acc;
            },
            {}
          );
          const decoded = decoder.advertisementDecode(
            advertisement.manufacturerData,
            serviceData
          );
          if (decoded) {
            const tag = isAdvertisementDuplicate(peripheral.id, advertisement) ? "duplicate" : "new advertisement";
            console.log(`Decoded ${tag} advertisement:`, decoded);
          }
        }
        if (decoder.start) {
          noble.stopScanning(); // cannot scan and connect at the same time
          startStreaming(peripheral, decoder);
        }
      }
    } catch (error) {
      console.error("Error processing peripheral:", error);
    }
  });
}

async function startStreaming(peripheral, decoder) {
  console.log("Connecting to device...");
  await peripheral.connectAsync();
  console.log("Discovering services...");
  const servicesAndCharacteristics =
    await peripheral.discoverAllServicesAndCharacteristicsAsync();
  console.log("Starting device...");
  for (const notifyEntry of decoder.notify) {
    const endpoint = find(
      servicesAndCharacteristics.services,
      notifyEntry.service.replace(/-/g, ""),
      notifyEntry.characteristic.replace(/-/g, "")
    );
    if (endpoint) {
      endpoint.on("data", (data, isNotification) => {
        if (isNotification) {
          console.log(
            `Service (${notifyEntry.service}) Characteristic (${notifyEntry.characteristic
            }) Data: ${data.toString("hex")}`
          );
          const decoded = notifyEntry.onNotification(peripheral.id, data);
          if (decoded) {
            console.log("Decoded data:", decoded);
          }
        }
      });
      await endpoint.subscribeAsync();
    } else {
      console.error(
        `Service ${notifyEntry.service} with characteristic ${notifyEntry.characteristic} not found -- cannot subscribe`
      );
    }
  }

  const bleApi = {
    write: async (deviceId, service, characteristic, data) => {
      if (deviceId !== peripheral.id) {
        console.error("Device ID mismatch on write");
        return;
      }
      const endpoint = find(
        servicesAndCharacteristics.services,
        service.replace(/-/g, ""),
        characteristic.replace(/-/g, "")
      );
      if (endpoint) {
        await endpoint.writeAsync(Buffer.from(data), false);
      } else {
        console.error(
          `Service ${service} with characteristic ${characteristic} not found -- cannot write`
        );
      }
    },
  };
  await decoder.start(peripheral.id, true, bleApi);
  console.log("Waiting 10 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log("Stopping device...");
  await decoder.stop(peripheral.id, bleApi);
  console.log("Stopped device. Exiting");
  process.exit(0);
}

function find(services, serviceUuid, characteristicUuid) {
  const service = services.find((s) => s.uuid === serviceUuid);
  if (!service) {
    console.error(`Service ${serviceUuid} not found`);
    return null;
  }
  const characteristic = service.characteristics.find(
    (c) => c.uuid === characteristicUuid
  );
  if (!characteristic) {
    console.error(`Characteristic ${characteristicUuid} not found`);
    return null;
  }
  return characteristic;
}

function isDecoderValid(decoder, advertisement) {
  if (decoder.name && advertisement.localName) {
    return decoder.name === advertisement.localName;
  }
  const manufacturerData = advertisement.manufacturerData;
  if (decoder.manufacturer && manufacturerData) {
    const manufacturerId = manufacturerData.subarray(0, 2).toString("hex");
    return decoder.manufacturer === manufacturerId;
  }

  if (decoder.serviceUUID && advertisement.serviceData) {
    const serviceData = advertisement.serviceData.find(
      (sd) => sd.uuid === decoder.serviceUUID
    );
    if (serviceData) {
      return true;
    }
  }
  return false;
}

const alreadyLoggedIds = new Set();
function logFoundDevice(id, advertisement) {
  if (alreadyLoggedIds.has(id)) {
    return;
  }
  alreadyLoggedIds.add(id);

  let properties = { id };
  if (advertisement.localName) {
    properties.name = advertisement.localName;
  }
  if (advertisement.serviceUuids) {
    properties.serviceUuids = JSON.stringify(advertisement.serviceUuids);
  }
  if (advertisement.manufacturerData) {
    properties.manufacturerData =
      advertisement.manufacturerData.toString("hex");
  }
  if (advertisement.serviceData) {
    properties.serviceData = advertisement.serviceData.map((sd) => ({
      uuid: sd.uuid,
      data: sd.data.toString("hex"),
    }));
  }
  console.log("Found device:", properties);
}

main();

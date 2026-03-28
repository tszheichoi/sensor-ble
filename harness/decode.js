import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDecoders } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const rootPath = dirname(dirname(__filename));

function processManufacturerData(hex) {
  if (!hex) return undefined;
  return Buffer.from(hex, "hex");
}

function processServiceData(str) {
  if (!str) return undefined;
  const colonIndex = str.indexOf(":");
  if (colonIndex === -1) return undefined;
  const uuid = str.slice(0, colonIndex);
  const hex = str.slice(colonIndex + 1);
  return { [uuid]: Buffer.from(hex, "hex") };
}

async function run() {
  const decoders = await getDecoders();
  const logsDir = join(rootPath, "sensorlogs");
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(join(logsDir, file), "utf8"));
    console.log(`\n--- ${file} (${records.length} records) ---`);

    for (const record of records) {
      const mfrBuf = processManufacturerData(record.manufacturerData);
      const svcBuf = processServiceData(record.serviceData);

      for (const { decoder } of decoders) {
        if (!decoder.advertisementDecode) continue;
        let result;
        try {
          result = decoder.advertisementDecode(mfrBuf, svcBuf);
        } catch {
          continue;
        }
        if (result != null) {
          console.log(decoder.decoderName, record.id, record.time, result);
        }
      }
    }
  }
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

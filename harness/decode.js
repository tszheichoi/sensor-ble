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

export async function decodeAll() {
  const decoders = await getDecoders();
  const logsDir = join(rootPath, "sensorlogs");
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".snap.json"));
  const allResults = [];

  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(join(logsDir, file), "utf8"));
    const fileResults = [];

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
          fileResults.push({
            decoderName: decoder.decoderName,
            id: record.id,
            time: record.time,
            result,
          });
        }
      }
    }

    allResults.push({ file, results: fileResults });
  }

  return allResults;
}

async function run() {
  const allResults = await decodeAll();
  for (const { file, results } of allResults) {
    console.log(`\n--- ${file} (${results.length} decoded) ---`);
    for (const { decoderName, id, time, result } of results) {
      console.log(decoderName, id, time, result);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

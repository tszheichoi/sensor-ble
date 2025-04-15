import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootPath = dirname(dirname(__filename));
const devicesDir = join(rootPath, "devices");

const decoders = [];

/**
 * Loads all decoder modules from the devices directory.
 * @returns {Promise<{decoder: Decoder, tests: Test[]}[]>} An array of decoder modules.
 */
export async function getDecoders() {
  if (decoders.length > 0) return decoders;

  for (const file of fs.readdirSync(devicesDir)) {
    if (file.endsWith(".js")) {
      const filePath = join(devicesDir, file);
      const fileUrl = pathToFileURL(filePath);
      const decoderModule = await import(fileUrl.href);
      decoders.push(decoderModule);
    }
  }

  return decoders;
}

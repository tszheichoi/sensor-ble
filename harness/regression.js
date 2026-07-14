import assert from "assert";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { decodeAll } from "./decode.js";

const __filename = fileURLToPath(import.meta.url);
const rootPath = dirname(dirname(__filename));
const logsDir = join(rootPath, "sensorlogs");

function snapPath(file) {
  const base = file.replace(/\.json$/, "");
  return join(logsDir, `${base}.snap.json`);
}

const isUpdate = process.argv.includes("--update");

async function run() {
  const allResults = await decodeAll();
  let failed = 0;

  for (const { file, results } of allResults) {
    const snap = snapPath(file);

    if (isUpdate) {
      fs.writeFileSync(snap, JSON.stringify(results, null, 2) + "\n", "utf8");
      console.log(`Updated snapshot: ${file} (${results.length} results)`);
      continue;
    }

    if (!fs.existsSync(snap)) {
      console.error(
        `No snapshot for "${file}" — run npm run decode:update first`
      );
      failed++;
      continue;
    }

    const expected = JSON.parse(fs.readFileSync(snap, "utf8"));

    try {
      assert.deepStrictEqual(results, expected);
      console.log(`PASS  ${file} (${results.length} results)`);
    } catch (err) {
      console.error(`FAIL  ${file}`);
      console.error(err.message);
      failed++;
    }
  }

  if (!isUpdate && failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

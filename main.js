import { decoder as airpods } from "./devices/airpods.js";
import { decoder as ruuvi } from "./devices/ruuvi.js";
import { decoder as muse_v3 } from "./devices/muse_v3.js";
import { decoder as bthome } from "./devices/bthome.js";

export const decoders = [ruuvi, muse_v3, airpods, bthome];

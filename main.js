import { decoder as airpods } from "./devices/airpods.js";
import { decoder as ruuvi } from "./devices/ruuvi.js";
import { decoder as muse_v3 } from "./devices/muse_v3.js";
import { decoder as bthome } from "./devices/bthome.js";
import { decoder as mopeka } from "./devices/mopeka.js";
import { decoder as cscs } from "./devices/cscs.js";
import { decoder as hrs } from "./devices/hrs.js";
import { decoder as cps } from "./devices/cps.js";
import { decoder as rscs } from "./devices/rscs.js";
import { decoder as witmotion } from "./devices/witmotion.js";
import { decoder as xiaomi_atc } from "./devices/xiaomi_atc.js";

export const decoders = [ruuvi, muse_v3, airpods, bthome, mopeka, cscs, hrs, cps, rscs, witmotion, xiaomi_atc];

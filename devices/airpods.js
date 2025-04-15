function hexCharToInt(c) {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - "0".charCodeAt(0);
  if (c >= "A" && c <= "F") return 10 + (c.charCodeAt(0) - "A".charCodeAt(0));
  return -1;
}

function isFlipped(str) {
  return (hexCharToInt(str[10]) & 0x02) === 0;
}

/** @param {Buffer} buffer  */
function decodePodsStatus(buffer) {
  const status = buffer.toString("hex");
  if (status.slice(4, 10) != "071901") {
    // its not an airpod
    return null;
  }

  const podsStatus = {
    leftPod: {},
    rightPod: {},
    casePod: {},
    singlePod: {},
    model: "",
  };

  if (!status) {
    podsStatus.model = "DISCONNECTED";
    return podsStatus;
  }

  const flip = isFlipped(status);

  const leftStatus = hexCharToInt(status[flip ? 12 : 13]);
  const rightStatus = hexCharToInt(status[flip ? 13 : 12]);
  const caseStatus = hexCharToInt(status[15]);
  const singleStatus = hexCharToInt(status[13]);

  const chargeStatus = hexCharToInt(status[14]);
  const chargeL = (chargeStatus & (flip ? 0b10 : 0b01)) !== 0;
  const chargeR = (chargeStatus & (flip ? 0b01 : 0b10)) !== 0;
  const chargeCase = (chargeStatus & 0b100) !== 0;
  const chargeSingle = (chargeStatus & 0b01) !== 0;

  const inEarStatus = hexCharToInt(status[11]);
  const inEarL = (inEarStatus & (flip ? 0b1000 : 0b10)) !== 0;
  const inEarR = (inEarStatus & (flip ? 0b10 : 0b1000)) !== 0;

  const idFull = status.slice(10, 14);
  let model = "Unknown";
  switch (idFull) {
    case "0220":
      model = "AirPods1";
      break;
    case "0F20":
      model = "AirPods2";
      break;
    case "1320":
      model = "AirPods3";
      break;
    case "0E20":
      model = "AirPodsPro1";
      break;
    case "1420":
      model = "AirPodsPro2 Lightning";
      break;
    case "2420":
      model = "AirPodsPro2 USB-C";
      break;
    case "0A20":
      model = "AirPodsMax Lightning";
      break;
    case "0320":
      model = "Powerbeats3";
      break;
    case "0520":
      model = "BeatsX";
      break;
    case "0620":
      model = "Beats Solo3";
      break;
  }

  return {
    left_status: leftStatus,
    right_status: rightStatus,
    case_status: caseStatus,
    single_status: singleStatus,
    charge_left: chargeL,
    charge_right: chargeR,
    charge_case: chargeCase,
    charge_single: chargeSingle,
    in_ear_left: inEarL,
    in_ear_right: inEarR,
    model: model,
  };
}

/** @type {Decoder} */
export const decoder = {
  decoderName: "airpods",
  manufacturer: "4c00",
  advertisementDecode: decodePodsStatus,
};

/** @type Test[] */
export const tests = [
  {
    given: {
      manufacturerData:
        "4c00071901142071aa9631000848e46443887f0a000000611fb4fd3a53",
    },
    expected: {
      left_status: 2,
      right_status: 0,
      case_status: 1,
      single_status: 0,
      charge_left: true,
      charge_right: true,
      charge_case: true,
      charge_single: true,
      in_ear_left: false,
      in_ear_right: false,
      model: "AirPodsPro2 Lightning",
    },
  },
  {
    given: {
      manufacturerData:
        "4c00071901142073aa9631000848e46443887f0a000000611f7973725a",
    },
    expected: {
      left_status: 2,
      right_status: 0,
      case_status: 3,
      single_status: 0,
      charge_left: true,
      charge_right: true,
      charge_case: true,
      charge_single: true,
      in_ear_left: false,
      in_ear_right: false,
      model: "AirPodsPro2 Lightning",
    },
  },
];

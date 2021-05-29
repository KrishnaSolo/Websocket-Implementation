"use strict";
const crypto = require("crypto");
// Websocket client utils

// This might be needed in server - but leave here for now
function hasDuplicates(arr) {
  const set = new Set();
  for (let val in arr) {
    if (set.has(val)) return true;
    set.add(val);
  }
  return false;
}

function maskData(payloadBuffer) {
  const randomBytes = crypto.randomBytes(4);
  const len = Buffer.byteLength(payloadBuffer);
  const maskedPayloadBuffer = Buffer.alloc(len);
  // console.log("Key: ", randomBytes, " len: ", len, " inputL: ", payloadBuffer);
  for (let i = 0; i < len; i++) {
    let index = i % 4;
    // console.log(
    //   "Before masking - i: ",
    //   i,
    //   " index: ",
    //   index,
    //   " input at i: ",
    //   payloadBuffer[i],
    //   " key at index: ",
    //   randomBytes[index]
    // );
    maskedPayloadBuffer[i] = payloadBuffer[i] ^ randomBytes[index];
    // console.log(
    //   "Masked data = ",
    //   maskedPayloadBuffer[i],
    //   " all data: ",
    //   maskedPayloadBuffer
    // );
  }
  return [maskedPayloadBuffer, randomBytes];
}

module.exports = { hasDuplicates, maskData };

"use strict";
const http = require("http");
const crypto = require("crypto");
const {
  ABORT_ERR,
  CLIENT_HEADERS,
  PROTOCOL_FAILED,
  PROTOCOL_MAP,
  STATE_MAP,
} = require("./websocket.constants");
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

// This is a lower abstraction - should be moved somewhere else
async function beginConnection() {
  console.log("test: ", this);
  const fetchCompatibleURL = new URL(this._urlRecord);

  //change protocol to http/https to play nice with fetch
  const oldProtocol = fetchCompatibleURL.protocol;
  fetchCompatibleURL.protocol = PROTOCOL_MAP[oldProtocol];

  const requestURL = fetchCompatibleURL.toString();
  const protocols = this._protocols.join(", ");

  const randomBytes = crypto.randomBytes(16);
  const buf = Buffer.alloc(16, randomBytes);

  const headers = {
    "Sec-Websocket-Key": buf.toString("base64"),
    "Sec-WebSocket-Protocol": protocols,
    ...CLIENT_HEADERS,
  };

  console.log(headers);
  const req = http.get(requestURL, {
    timeout: 200,
    headers: headers,
  });

  req.on("upgrade", (res, socket, head) => {
    const { statusCode, statusMessage, aborted, headers } = res;
    console.log(
      "Upgrade complete. response: ",
      statusMessage,
      " statuscode: ",
      statusCode,
      " headers: ",
      headers
    );
    if (aborted) {
      this._readyState = STATE_MAP.CLOSED;
      req.destroy(ABORT_ERR);
    }
    if (statusCode !== 101)
      return this.close(1002, "Status Code was not 101 from server.");
    if (invalidHeaders.call(this, headers, buf.toString("base64"))) {
      return this.close(1002, "Header from server were not valid.");
    }

    this._socket = setupSocket.call(this, socket);
    this._readyState = STATE_MAP.OPEN;
    this._protocol = headers["sec-websocket-protocol"] || "";
    this.onopen();
    this.emit("open");
  });

  req.on("error", (res) => {
    console.log("error:", res);
    req.destroy(ABORT_ERR);
    this._readyState = STATE_MAP.CLOSED;
  });
}

function setupSocket(socket) {
  socket.on("error", (res) => {
    if (res instanceof Error) {
      this.emit("error", res.message);
      this.onerror(res.message);
      return;
    }
    const codeBuffer = res.slice(0, 2);
    const errBuffer = res.slice(2);
    const error = errBuffer.toString();
    this.emit("error", error);
    this.onerror(error);
  });
  socket.on("data", (data) => {
    // Need to validate this but for the scope of this project we can leave it
    const codeBuffer = data.slice(0, 2);
    const msgBuffer = data.slice(2);
    const message = msgBuffer.toString();
    this.emit("message", message);
    this.onmessage(message);
  });
  return socket;
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

// TODO: make more generic
function convertToBinary(code, size) {
  const binStr = code.toString(2);
  const len = binStr.length;
  const missingBits = size - len;
  const frameCompatibleCode = code * 2 ** missingBits;
  const codeStr = frameCompatibleCode.toString(2);
  const byte1 = new Number(codeStr.slice(0, 8));
  const byte2 = new Number(codeStr.slice(8, 16));
  const finalBuffer = Buffer.from([byte1, byte2]);
  return finalBuffer;
}

function closeConnection(code, reason, closeFrame, socket) {
  this._readyState = STATE_MAP.CLOSING;
  console.log("closeing frame: ", closeFrame);

  socket.setTimeout(3000);
  socket.on("data", (res) => {
    console.log("Server Return Response: ", res);
    socket.on("end", (res) => {
      console.log("end connection now!");
      socket.destroy(PROTOCOL_FAILED);
      this._readyState = STATE_MAP.CLOSED;
    });
  });
  socket.on("timeout", () => {
    if (!socket.destroyed) {
      console.log("failing socket");
      socket.destroy(PROTOCOL_FAILED);
      this._readyState = STATE_MAP.CLOSED;
    }
  });

  const res = socket.write(closeFrame);
  this._readyState = STATE_MAP.CLOSED;
  this.emit("close", code, reason);
  this.onclose(code, reason);
  console.log("status: ", res);
}

function invalidHeaders(headers, key) {
  // Note: localecompare return 0 if strings match
  if (headers.upgrade.localeCompare("websocket")) return true;
  if (headers.connection.localeCompare("Upgrade")) return true;
  if (!this._protocols.includes(headers["sec-websocket-protocol"])) return true;

  // Validation check to see if key can be used to create same value as value in header
  const hash = crypto.createHash("sha1");
  const serverKey = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  const encryptedServerKey = hash.update(serverKey);
  const targetAcceptValue = encryptedServerKey.digest("base64");

  if (targetAcceptValue !== headers["sec-websocket-accept"]) return true;
  return false;
}

module.exports = {
  hasDuplicates,
  maskData,
  beginConnection,
  convertToBinary,
  closeConnection,
};

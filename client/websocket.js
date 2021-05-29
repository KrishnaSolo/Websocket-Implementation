"use strict";
const http = require("http");
const net = require("net");
const buffer = require("buffer");
const crypto = require("crypto");
const EventEmitter = require("events");

// TODO: move into constants file
const WS = "ws";
const WSS = "wss";
const ABORT_ERR = new Error(
  "Websocket Connection Failed - request was aborted"
);
const PROTOCOL_FAILED = new Error(
  "Websocket Connection was aborted due to server response failing validation."
);
const MESSAGE_CONSTRAINT_ERR = new Error(
  "Websocket could not send data due to byte size of data being over 127 Bytes."
);
const CLIENT_HEADERS = {
  Connection: "Upgrade",
  Upgrade: "Websocket",
  "Sec-Websocket-Version": 13,
  "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
};
const schemePortMap = {
  http: 80,
  https: 443,
};
const protocolMap = {
  "ws:": "http:",
  "wss:": "https:",
};

// TODO: move into utils file
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

/* Based of WHATWG living standard */
class WebsocketClient extends EventEmitter {
  /* private variables */
  // TODO: needs a getter which serializes value using algo definied in spec - but we can use .toString() on URL object
  #urlRecord;
  #protocols;
  #socket;
  #CONNECTING = 0;
  #OPEN = 1;
  #CLOSING = 2;
  #CLOSED = 3;

  /* public variables */
  protocol;
  readyState;
  bufferedAmount;

  // TODO: Missing a check to see if protocol(s) is(are) defined as per RFC 2616
  constructor(url, protocols = []) {
    super();

    const urlRecord = new URL(url); // specs say to use a url parser algo, but this is out of scope
    const hasWS = urlRecord.protocol.includes(WS);
    const hasWSS = urlRecord.protocol.includes(WSS);
    //console.log(urlRecord);
    const hasFragment = urlRecord.hash;
    if (!hasWS && !hasWSS)
      throw new SyntaxError(
        "URL scheme provided is not valid - must use WS or WSS"
      );
    if (hasFragment)
      throw new SyntaxError(
        "URL should not have any fragments - e.g. '...website.com/#someFragment'"
      );

    if (typeof protocols === "string") protocols = [protocols];
    if (hasDuplicates(protocols))
      throw new SyntaxError(
        "Protocols provided has one or more duplicate values"
      );
    this.#urlRecord = urlRecord;
    this.#protocols = protocols;
    this.readyState = this.#CONNECTING;
    this.beginConnection();
  }

  // This is a lower abstraction - should be moved somewhere else
  async beginConnection() {
    const fetchCompatibleURL = new URL(this.#urlRecord);

    //change protocol to http/https to play nice with fetch
    const oldProtocol = fetchCompatibleURL.protocol;
    fetchCompatibleURL.protocol = protocolMap[oldProtocol];

    const requestURL = fetchCompatibleURL.toString();
    const protocols = this.#protocols.join(", ");

    const randomBytes = crypto.randomBytes(16);
    const buf = Buffer.alloc(16, randomBytes);

    const headers = {
      "Sec-Websocket-Key": buf.toString("base64"),
      "Sec-WebSocket-Protocol": protocols,
      ...CLIENT_HEADERS,
    };

    console.log(headers);
    const req = http.get(requestURL, {
      // Not sure if below is necessary - remove/investigate later
      // createConnection: (options) => {
      //   options.path = options.socketPath;
      //   return net.connect(options);
      // },
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
        this.readyState = this.#CLOSED;
        req.destroy(ABORT_ERR);
      }
      if (statusCode !== 101) return this.closeConnection(socket);
      if (this.invalidHeaders(headers, buf.toString("base64"))) {
        console.log("hrer");
        return this.closeConnection(socket);
      }

      this.#socket = socket;
      this.readyState = this.#OPEN;
      this.protocol = headers["sec-websocket-protocol"][0] || "";
      this.emit("open");
    });

    req.on("error", (res) => {
      console.log("error:", res);
      req.destroy(ABORT_ERR);
      this.readyState = this.#CLOSED;
    });
  }

  sendData(dataText) {
    const message = Buffer.from(dataText);
    const len = message.length;
    console.log("Data is ", len, " bytes long");

    if (len > 127) throw MESSAGE_CONSTRAINT_ERR;
    const frameHeader = Buffer.from([0x81]);
    // 128 is the offset so we can get the binary 1xxx xxxx - where the 7 x's represent the bits used by the frame
    // to convey length of message. Since JS has limited binary control, an offset is used.
    const messageLength = 128 + len;
    const frameMessageDetails = Buffer.from([messageLength]);
    const dataLen = frameHeader.length + frameMessageDetails.length;
    const data = Buffer.concat([frameHeader, frameMessageDetails], dataLen);

    const [maskedData, key] = maskData(message);
    const totalLength = data.length + maskedData.length + key.length;
    console.log("Total Length", totalLength);
    const textFrame = Buffer.concat([data, key, maskedData], totalLength);

    console.log("text frame: ", textFrame);
    const res = this.#socket.write(textFrame);
    this.emit("text", "Message Status: " + res);
    console.log("status: ", res);
  }
  send(code, data, socket = this.#socket) {}

  closeConnection(socket = this.#socket) {
    this.readyState = this.#CLOSING;

    // Code used to close the frame
    const OPCODE = Buffer.from([0x03, 0xea]);
    const data = Buffer.from([0x88, 0x82]);
    console.log("opcode and then data: ", OPCODE, " , ", data);

    const [maskedData, key] = maskData(OPCODE);
    const totalLength = data.length + maskedData.length + key.length;
    console.log("Total Length", totalLength);
    const closeframe = Buffer.concat([data, key, maskedData], totalLength);

    console.log("closeing frame: ", closeframe);

    socket.setTimeout(3000);

    socket.on("data", (res) => {
      console.log("Return ", res);
    });
    socket.on("end", () => {
      console.log("end connection now!");
      socket.destroy(PROTOCOL_FAILED);
      this.readyState = this.#CLOSED;
    });
    socket.on("timeout", () => {
      if (!socket.destroyed) {
        console.log("failing socket");
        socket.destroy(PROTOCOL_FAILED);
        this.readyState = this.#CLOSED;
      }
    });

    const res = socket.write(closeframe);
    // send(code, data, socket); - code will be 1002, data will be text i want to send
    this.readyState = this.#CLOSED;
    this.emit("close");
    console.log("status: ", res);
  }

  invalidHeaders(headers, key) {
    // Note: localecompare return 0 if strings match
    if (headers.upgrade.localeCompare("websocket")) return true;
    if (headers.connection.localeCompare("Upgrade")) return true;
    if (!this.#protocols.includes(headers["sec-websocket-protocol"]))
      return true;

    // Validation check to see if key can be used to create same value as value in header
    const hash = crypto.createHash("sha1");
    const serverKey = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const encryptedServerKey = hash.update(serverKey);
    const targetAcceptValue = encryptedServerKey.digest("base64");

    if (targetAcceptValue !== headers["sec-websocket-accept"]) return true;
    return false;
  }
}

const ws = new WebsocketClient("ws://127.0.0.1:8080/", ["chat"]);
ws.on("open", () => {
  console.log("woooo!");
  ws.sendData("nice work");
});
ws.on("text", (res) => {
  console.log(res);
});

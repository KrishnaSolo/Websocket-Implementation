"use strict";
const http = require("http");
const crypto = require("crypto");
const EventEmitter = require("events");
const {
  ABORT_ERR,
  CLIENT_HEADERS,
  MESSAGE_CONSTRAINT_ERR,
  PROTOCOL_FAILED,
  PROTOCOL_MAP,
  WS,
  WSS,
} = require("./websocket.constants");
const { hasDuplicates, maskData } = require("./websocket.utils");

/* Based of WHATWG living standard */
class WebsocketClient extends EventEmitter {
  /* private variables */
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
  url;

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
    this.url = urlRecord.toString();
    this.beginConnection();
  }

  // This is a lower abstraction - should be moved somewhere else
  async beginConnection() {
    const fetchCompatibleURL = new URL(this.#urlRecord);

    //change protocol to http/https to play nice with fetch
    const oldProtocol = fetchCompatibleURL.protocol;
    fetchCompatibleURL.protocol = PROTOCOL_MAP[oldProtocol];

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

      this.#socket = this.setupSocket(socket);
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

  setupSocket(socket) {
    socket.on("error", (res) => {
      const codeBuffer = res.slice(0, 2);
      const errBuffer = res.slice(2);
      const error = errBuffer.toString();
      this.emit("error", error);
    });
    socket.on("data", (data) => {
      // Need to validate this but for the scope of this project we can leave it
      const codeBuffer = data.slice(0, 2);
      const msgBuffer = data.slice(2);
      const message = msgBuffer.toString();
      this.emit("message", message);
    });
    return socket;
  }

  send(dataText) {
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

  sendFrame(code, data, socket = this.#socket) {}
  convertToBinary(code, size) {
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

  close(code, closeReason) {
    // Below has been copied - move later on
    const message = Buffer.from(closeReason);
    const len = message.length;
    console.log("Data is ", len, " bytes long");

    if (len > 127) throw MESSAGE_CONSTRAINT_ERR;
    // TODO - add code validation

    // Code used to let server know why connection was closed
    const OPCODE = this.convertToBinary(code, 16); //Buffer.from([0x03, 0xea]);
    const data = Buffer.from([0x88, 0x82]);
    console.log("opcode and then data: ", OPCODE, " , ", data);

    const [maskedData, key] = maskData(OPCODE);
    const totalLength = data.length + maskedData.length + key.length;
    console.log("Total Length", totalLength);
    const closeFrame = Buffer.concat([data, key, maskedData], totalLength);
    this.closeConnection(closeFrame);
  }

  closeConnection(closeFrame, socket = this.#socket) {
    this.readyState = this.#CLOSING;
    console.log("closeing frame: ", closeFrame);

    socket.setTimeout(3000);

    socket.on("data", (res) => {
      console.log("Server Return Flavor: ", res);
      socket.on("end", () => {
        console.log("end connection now!");
        socket.destroy(PROTOCOL_FAILED);
        this.readyState = this.#CLOSED;
      });
    });
    socket.on("timeout", () => {
      if (!socket.destroyed) {
        console.log("failing socket");
        socket.destroy(PROTOCOL_FAILED);
        this.readyState = this.#CLOSED;
      }
    });

    const res = socket.write(closeFrame);
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

module.exports = WebsocketClient;

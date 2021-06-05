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
  STATE_MAP,
  WS,
  WSS,
} = require("./websocket.constants");
const {
  hasDuplicates,
  maskData,
  beginConnection,
  closeConnection,
  convertToBinary,
} = require("./websocket.utils");

/* Based of WHATWG living standard */
class WebsocketClient extends EventEmitter {
  /* private variables */
  #urlRecord;
  #protocols;
  #socket;
  #protocol;
  #readyState;
  #bufferedAmount;
  #LISTENER_MAP = {
    onmessage: () => {},
    onerror: () => {},
    onopen: () => {},
    onclose: () => {},
  };

  /* public variables - All Read only */
  get protocol() {
    return this.#protocol;
  }
  get readyState() {
    return this.#readyState;
  }
  get bufferedAmount() {
    return this.#bufferedAmount;
  }
  get URL() {
    return this.#urlRecord;
  }

  /* Constants */
  get CONNECTING() {
    return STATE_MAP.CONNECTING;
  }
  get OPEN() {
    return STATE_MAP.OPEN;
  }
  get CLOSING() {
    return STATE_MAP.CLOSING;
  }
  get CLOSED() {
    return STATE_MAP.CLOSED;
  }

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
    this.#readyState = STATE_MAP.CONNECTING;
    ["onmessage", "onopen", "onclose", "onerror"].map((val) => {
      Object.defineProperty(this, val, {
        get() {
          return this.#LISTENER_MAP[val];
        },
        set(fn) {
          this.#LISTENER_MAP[val] = fn;
        },
      });
    });
    beginConnection.call(this);
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

  close(code, closeReason) {
    // Below has been copied - move later on
    const message = Buffer.from(closeReason);
    const len = message.length;
    console.log("Data is ", len, " bytes long");

    if (len > 127) throw MESSAGE_CONSTRAINT_ERR;
    // TODO - add code validation

    // Code used to let server know why connection was closed
    const OPCODE = convertToBinary(code, 16); //Buffer.from([0x03, 0xea]);
    const data = Buffer.from([0x88, 0x82]);
    console.log("opcode and then data: ", OPCODE, " , ", data);

    const [maskedData, key] = maskData(OPCODE);
    const totalLength = data.length + maskedData.length + key.length;
    console.log("Total Length", totalLength);
    const closeFrame = Buffer.concat([data, key, maskedData], totalLength);
    closeConnection.call(this, code, closeReason, closeFrame, this.#socket);
  }
}

module.exports = WebsocketClient;

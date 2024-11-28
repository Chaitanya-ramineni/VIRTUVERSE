"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeMulti = exports.decode = exports.defaultDecodeOptions = void 0;
const Decoder_1 = require("./Decoder");
/**
 * @deprecated No longer supported.
 */
exports.defaultDecodeOptions = undefined;
/**
 * It decodes a single MessagePack object in a buffer.
 *
 * This is a synchronous decoding function.
 * See other variants for asynchronous decoding: {@link decodeAsync}, {@link decodeStream}, or {@link decodeArrayStream}.
 *
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
function decode(buffer, options) {
    const decoder = new Decoder_1.Decoder(options);
    return decoder.decode(buffer);
}
exports.decode = decode;
/**
 * It decodes multiple MessagePack objects in a buffer.
 * This is corresponding to {@link decodeMultiStream}.
 *
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
function decodeMulti(buffer, options) {
    const decoder = new Decoder_1.Decoder(options);
    return decoder.decodeMulti(buffer);
}
exports.decodeMulti = decodeMulti;
//# sourceMappingURL=decode.js.map
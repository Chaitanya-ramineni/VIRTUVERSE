"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStream = exports.decodeMultiStream = exports.decodeArrayStream = exports.decodeAsync = void 0;
const Decoder_1 = require("./Decoder");
const stream_1 = require("./utils/stream");
/**
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
async function decodeAsync(streamLike, options) {
    const stream = (0, stream_1.ensureAsyncIterable)(streamLike);
    const decoder = new Decoder_1.Decoder(options);
    return decoder.decodeAsync(stream);
}
exports.decodeAsync = decodeAsync;
/**
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
function decodeArrayStream(streamLike, options) {
    const stream = (0, stream_1.ensureAsyncIterable)(streamLike);
    const decoder = new Decoder_1.Decoder(options);
    return decoder.decodeArrayStream(stream);
}
exports.decodeArrayStream = decodeArrayStream;
/**
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
function decodeMultiStream(streamLike, options) {
    const stream = (0, stream_1.ensureAsyncIterable)(streamLike);
    const decoder = new Decoder_1.Decoder(options);
    return decoder.decodeStream(stream);
}
exports.decodeMultiStream = decodeMultiStream;
/**
 * @deprecated Use {@link decodeMultiStream} instead.
 */
exports.decodeStream = undefined;
//# sourceMappingURL=decodeAsync.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decoder = exports.DataViewIndexOutOfBoundsError = void 0;
const prettyByte_1 = require("./utils/prettyByte");
const ExtensionCodec_1 = require("./ExtensionCodec");
const int_1 = require("./utils/int");
const utf8_1 = require("./utils/utf8");
const typedArrays_1 = require("./utils/typedArrays");
const CachedKeyDecoder_1 = require("./CachedKeyDecoder");
const DecodeError_1 = require("./DecodeError");
const STATE_ARRAY = "array";
const STATE_MAP_KEY = "map_key";
const STATE_MAP_VALUE = "map_value";
function isValidMapKeyType(key, useMap, supportObjectNumberKeys) {
    if (useMap) {
        return (typeof key === "string" ||
            typeof key === "number" ||
            typeof key === "bigint" ||
            key instanceof Uint8Array ||
            key instanceof typedArrays_1.RawBinaryString);
    }
    // Plain objects support a more limited set of key types
    return typeof key === "string" || (supportObjectNumberKeys && typeof key === "number");
}
class StackPool {
    constructor(useMap) {
        this.useMap = useMap;
        this.stack = [];
        this.stackHeadPosition = -1;
    }
    get length() {
        return this.stackHeadPosition + 1;
    }
    top() {
        return this.stack[this.stackHeadPosition];
    }
    pushArrayState(size) {
        const state = this.getUninitializedStateFromPool();
        state.type = STATE_ARRAY;
        state.position = 0;
        state.size = size;
        state.array = new Array(size);
    }
    pushMapState(size) {
        const state = this.getUninitializedStateFromPool();
        state.type = STATE_MAP_KEY;
        state.readCount = 0;
        state.size = size;
        state.map = this.useMap ? new Map() : {};
    }
    getUninitializedStateFromPool() {
        this.stackHeadPosition++;
        if (this.stackHeadPosition === this.stack.length) {
            const partialState = {
                type: undefined,
                size: 0,
                array: undefined,
                position: 0,
                readCount: 0,
                map: undefined,
                key: null,
            };
            this.stack.push(partialState);
        }
        return this.stack[this.stackHeadPosition];
    }
    release(state) {
        const topStackState = this.stack[this.stackHeadPosition];
        if (topStackState !== state) {
            throw new Error("Invalid stack state. Released state is not on top of the stack.");
        }
        if (state.type === STATE_ARRAY) {
            const partialState = state;
            partialState.size = 0;
            partialState.array = undefined;
            partialState.position = 0;
            partialState.type = undefined;
        }
        if (state.type === STATE_MAP_KEY || state.type === STATE_MAP_VALUE) {
            const partialState = state;
            partialState.size = 0;
            partialState.map = undefined;
            partialState.readCount = 0;
            partialState.type = undefined;
        }
        this.stackHeadPosition--;
    }
    reset() {
        this.stack.length = 0;
        this.stackHeadPosition = -1;
    }
}
const HEAD_BYTE_REQUIRED = -1;
const EMPTY_VIEW = new DataView(new ArrayBuffer(0));
const EMPTY_BYTES = new Uint8Array(EMPTY_VIEW.buffer);
try {
    // IE11: The spec says it should throw RangeError,
    // IE11: but in IE11 it throws TypeError.
    EMPTY_VIEW.getInt8(0);
}
catch (e) {
    if (!(e instanceof RangeError)) {
        throw new Error("This module is not supported in the current JavaScript engine because DataView does not throw RangeError on out-of-bounds access");
    }
}
exports.DataViewIndexOutOfBoundsError = RangeError;
const MORE_DATA = new exports.DataViewIndexOutOfBoundsError("Insufficient data");
const sharedCachedKeyDecoder = new CachedKeyDecoder_1.CachedKeyDecoder();
class Decoder {
    constructor(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.totalPos = 0;
        this.pos = 0;
        this.view = EMPTY_VIEW;
        this.bytes = EMPTY_BYTES;
        this.headByte = HEAD_BYTE_REQUIRED;
        this.extensionCodec = (_a = options === null || options === void 0 ? void 0 : options.extensionCodec) !== null && _a !== void 0 ? _a : ExtensionCodec_1.ExtensionCodec.defaultCodec;
        this.context = options === null || options === void 0 ? void 0 : options.context; // needs a type assertion because EncoderOptions has no context property when ContextType is undefined
        this.intMode = (_b = options === null || options === void 0 ? void 0 : options.intMode) !== null && _b !== void 0 ? _b : ((options === null || options === void 0 ? void 0 : options.useBigInt64) ? int_1.IntMode.AS_ENCODED : int_1.IntMode.UNSAFE_NUMBER);
        this.rawBinaryStringValues = (_c = options === null || options === void 0 ? void 0 : options.rawBinaryStringValues) !== null && _c !== void 0 ? _c : false;
        this.rawBinaryStringKeys = (_d = options === null || options === void 0 ? void 0 : options.rawBinaryStringKeys) !== null && _d !== void 0 ? _d : false;
        this.useRawBinaryStringClass = (_e = options === null || options === void 0 ? void 0 : options.useRawBinaryStringClass) !== null && _e !== void 0 ? _e : false;
        this.useMap = (_f = options === null || options === void 0 ? void 0 : options.useMap) !== null && _f !== void 0 ? _f : false;
        this.supportObjectNumberKeys = (_g = options === null || options === void 0 ? void 0 : options.supportObjectNumberKeys) !== null && _g !== void 0 ? _g : false;
        this.maxStrLength = (_h = options === null || options === void 0 ? void 0 : options.maxStrLength) !== null && _h !== void 0 ? _h : int_1.UINT32_MAX;
        this.maxBinLength = (_j = options === null || options === void 0 ? void 0 : options.maxBinLength) !== null && _j !== void 0 ? _j : int_1.UINT32_MAX;
        this.maxArrayLength = (_k = options === null || options === void 0 ? void 0 : options.maxArrayLength) !== null && _k !== void 0 ? _k : int_1.UINT32_MAX;
        this.maxMapLength = (_l = options === null || options === void 0 ? void 0 : options.maxMapLength) !== null && _l !== void 0 ? _l : int_1.UINT32_MAX;
        this.maxExtLength = (_m = options === null || options === void 0 ? void 0 : options.maxExtLength) !== null && _m !== void 0 ? _m : int_1.UINT32_MAX;
        this.keyDecoder = (options === null || options === void 0 ? void 0 : options.keyDecoder) !== undefined ? options.keyDecoder : sharedCachedKeyDecoder;
        if (this.rawBinaryStringKeys && !this.useMap) {
            throw new Error("rawBinaryStringKeys is only supported when useMap is true");
        }
        this.stack = new StackPool(this.useMap);
    }
    reinitializeState() {
        this.totalPos = 0;
        this.headByte = HEAD_BYTE_REQUIRED;
        this.stack.reset();
        // view, bytes, and pos will be re-initialized in setBuffer()
    }
    setBuffer(buffer) {
        this.bytes = (0, typedArrays_1.ensureUint8Array)(buffer);
        this.view = (0, typedArrays_1.createDataView)(this.bytes);
        this.pos = 0;
    }
    appendBuffer(buffer) {
        if (this.headByte === HEAD_BYTE_REQUIRED && !this.hasRemaining(1)) {
            this.setBuffer(buffer);
        }
        else {
            const remainingData = this.bytes.subarray(this.pos);
            const newData = (0, typedArrays_1.ensureUint8Array)(buffer);
            // concat remainingData + newData
            const newBuffer = new Uint8Array(remainingData.length + newData.length);
            newBuffer.set(remainingData);
            newBuffer.set(newData, remainingData.length);
            this.setBuffer(newBuffer);
        }
    }
    hasRemaining(size) {
        return this.view.byteLength - this.pos >= size;
    }
    createExtraByteError(posToShow) {
        const { view, pos } = this;
        return new RangeError(`Extra ${view.byteLength - pos} of ${view.byteLength} byte(s) found at buffer[${posToShow}]`);
    }
    /**
     * @throws {@link DecodeError}
     * @throws {@link RangeError}
     */
    decode(buffer) {
        this.reinitializeState();
        this.setBuffer(buffer);
        const object = this.doDecodeSync();
        if (this.hasRemaining(1)) {
            throw this.createExtraByteError(this.pos);
        }
        return object;
    }
    *decodeMulti(buffer) {
        this.reinitializeState();
        this.setBuffer(buffer);
        while (this.hasRemaining(1)) {
            yield this.doDecodeSync();
        }
    }
    async decodeAsync(stream) {
        let decoded = false;
        let object;
        for await (const buffer of stream) {
            if (decoded) {
                throw this.createExtraByteError(this.totalPos);
            }
            this.appendBuffer(buffer);
            try {
                object = this.doDecodeSync();
                decoded = true;
            }
            catch (e) {
                if (!(e instanceof exports.DataViewIndexOutOfBoundsError)) {
                    throw e; // rethrow
                }
                // fallthrough
            }
            this.totalPos += this.pos;
        }
        if (decoded) {
            if (this.hasRemaining(1)) {
                throw this.createExtraByteError(this.totalPos);
            }
            return object;
        }
        const { headByte, pos, totalPos } = this;
        throw new RangeError(`Insufficient data in parsing ${(0, prettyByte_1.prettyByte)(headByte)} at ${totalPos} (${pos} in the current buffer)`);
    }
    decodeArrayStream(stream) {
        return this.decodeMultiAsync(stream, true);
    }
    decodeStream(stream) {
        return this.decodeMultiAsync(stream, false);
    }
    async *decodeMultiAsync(stream, isArray) {
        let isArrayHeaderRequired = isArray;
        let arrayItemsLeft = -1;
        for await (const buffer of stream) {
            if (isArray && arrayItemsLeft === 0) {
                throw this.createExtraByteError(this.totalPos);
            }
            this.appendBuffer(buffer);
            if (isArrayHeaderRequired) {
                arrayItemsLeft = this.readArraySize();
                isArrayHeaderRequired = false;
                this.complete();
            }
            try {
                while (true) {
                    yield this.doDecodeSync();
                    if (--arrayItemsLeft === 0) {
                        break;
                    }
                }
            }
            catch (e) {
                if (!(e instanceof exports.DataViewIndexOutOfBoundsError)) {
                    throw e; // rethrow
                }
                // fallthrough
            }
            this.totalPos += this.pos;
        }
    }
    doDecodeSync() {
        DECODE: while (true) {
            const headByte = this.readHeadByte();
            let object;
            if (headByte >= 0xe0) {
                // negative fixint (111x xxxx) 0xe0 - 0xff
                object = this.convertNumber(headByte - 0x100);
            }
            else if (headByte < 0xc0) {
                if (headByte < 0x80) {
                    // positive fixint (0xxx xxxx) 0x00 - 0x7f
                    object = this.convertNumber(headByte);
                }
                else if (headByte < 0x90) {
                    // fixmap (1000 xxxx) 0x80 - 0x8f
                    const size = headByte - 0x80;
                    if (size !== 0) {
                        this.pushMapState(size);
                        this.complete();
                        continue DECODE;
                    }
                    else {
                        object = this.useMap ? new Map() : {};
                    }
                }
                else if (headByte < 0xa0) {
                    // fixarray (1001 xxxx) 0x90 - 0x9f
                    const size = headByte - 0x90;
                    if (size !== 0) {
                        this.pushArrayState(size);
                        this.complete();
                        continue DECODE;
                    }
                    else {
                        object = [];
                    }
                }
                else {
                    // fixstr (101x xxxx) 0xa0 - 0xbf
                    const byteLength = headByte - 0xa0;
                    object = this.decodeString(byteLength, 0);
                }
            }
            else if (headByte === 0xc0) {
                // nil
                object = null;
            }
            else if (headByte === 0xc2) {
                // false
                object = false;
            }
            else if (headByte === 0xc3) {
                // true
                object = true;
            }
            else if (headByte === 0xca) {
                // float 32
                object = this.readF32();
            }
            else if (headByte === 0xcb) {
                // float 64
                object = this.readF64();
            }
            else if (headByte === 0xcc) {
                // uint 8
                object = this.convertNumber(this.readU8());
            }
            else if (headByte === 0xcd) {
                // uint 16
                object = this.convertNumber(this.readU16());
            }
            else if (headByte === 0xce) {
                // uint 32
                object = this.convertNumber(this.readU32());
            }
            else if (headByte === 0xcf) {
                // uint 64
                object = this.readU64();
            }
            else if (headByte === 0xd0) {
                // int 8
                object = this.convertNumber(this.readI8());
            }
            else if (headByte === 0xd1) {
                // int 16
                object = this.convertNumber(this.readI16());
            }
            else if (headByte === 0xd2) {
                // int 32
                object = this.convertNumber(this.readI32());
            }
            else if (headByte === 0xd3) {
                // int 64
                object = this.readI64();
            }
            else if (headByte === 0xd9) {
                // str 8
                const byteLength = this.lookU8();
                object = this.decodeString(byteLength, 1);
            }
            else if (headByte === 0xda) {
                // str 16
                const byteLength = this.lookU16();
                object = this.decodeString(byteLength, 2);
            }
            else if (headByte === 0xdb) {
                // str 32
                const byteLength = this.lookU32();
                object = this.decodeString(byteLength, 4);
            }
            else if (headByte === 0xdc) {
                // array 16
                const size = this.readU16();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = [];
                }
            }
            else if (headByte === 0xdd) {
                // array 32
                const size = this.readU32();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = [];
                }
            }
            else if (headByte === 0xde) {
                // map 16
                const size = this.readU16();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = {};
                }
            }
            else if (headByte === 0xdf) {
                // map 32
                const size = this.readU32();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = {};
                }
            }
            else if (headByte === 0xc4) {
                // bin 8
                const size = this.lookU8();
                object = this.decodeBinary(size, 1);
            }
            else if (headByte === 0xc5) {
                // bin 16
                const size = this.lookU16();
                object = this.decodeBinary(size, 2);
            }
            else if (headByte === 0xc6) {
                // bin 32
                const size = this.lookU32();
                object = this.decodeBinary(size, 4);
            }
            else if (headByte === 0xd4) {
                // fixext 1
                object = this.decodeExtension(1, 0);
            }
            else if (headByte === 0xd5) {
                // fixext 2
                object = this.decodeExtension(2, 0);
            }
            else if (headByte === 0xd6) {
                // fixext 4
                object = this.decodeExtension(4, 0);
            }
            else if (headByte === 0xd7) {
                // fixext 8
                object = this.decodeExtension(8, 0);
            }
            else if (headByte === 0xd8) {
                // fixext 16
                object = this.decodeExtension(16, 0);
            }
            else if (headByte === 0xc7) {
                // ext 8
                const size = this.lookU8();
                object = this.decodeExtension(size, 1);
            }
            else if (headByte === 0xc8) {
                // ext 16
                const size = this.lookU16();
                object = this.decodeExtension(size, 2);
            }
            else if (headByte === 0xc9) {
                // ext 32
                const size = this.lookU32();
                object = this.decodeExtension(size, 4);
            }
            else {
                throw new DecodeError_1.DecodeError(`Unrecognized type byte: ${(0, prettyByte_1.prettyByte)(headByte)}`);
            }
            this.complete();
            const stack = this.stack;
            while (stack.length > 0) {
                // arrays and maps
                const state = stack.top();
                if (state.type === STATE_ARRAY) {
                    state.array[state.position] = object;
                    state.position++;
                    if (state.position === state.size) {
                        object = state.array;
                        stack.release(state);
                    }
                    else {
                        continue DECODE;
                    }
                }
                else if (state.type === STATE_MAP_KEY) {
                    if (!isValidMapKeyType(object, this.useMap, this.supportObjectNumberKeys)) {
                        const acceptableTypes = this.useMap
                            ? "string, number, bigint, or Uint8Array"
                            : this.supportObjectNumberKeys
                                ? "string or number"
                                : "string";
                        throw new DecodeError_1.DecodeError(`The type of key must be ${acceptableTypes} but got ${typeof object}`);
                    }
                    if (!this.useMap && object === "__proto__") {
                        throw new DecodeError_1.DecodeError("The key __proto__ is not allowed");
                    }
                    state.key = object;
                    state.type = STATE_MAP_VALUE;
                    continue DECODE;
                }
                else {
                    // it must be `state.type === State.MAP_VALUE` here
                    if (this.useMap) {
                        state.map.set(state.key, object);
                    }
                    else {
                        state.map[state.key] = object;
                    }
                    state.readCount++;
                    if (state.readCount === state.size) {
                        object = state.map;
                        stack.release(state);
                    }
                    else {
                        state.key = null;
                        state.type = STATE_MAP_KEY;
                        continue DECODE;
                    }
                }
            }
            return object;
        }
    }
    readHeadByte() {
        if (this.headByte === HEAD_BYTE_REQUIRED) {
            this.headByte = this.readU8();
            // console.log("headByte", prettyByte(this.headByte));
        }
        return this.headByte;
    }
    complete() {
        this.headByte = HEAD_BYTE_REQUIRED;
    }
    readArraySize() {
        const headByte = this.readHeadByte();
        switch (headByte) {
            case 0xdc:
                return this.readU16();
            case 0xdd:
                return this.readU32();
            default: {
                if (headByte < 0xa0) {
                    return headByte - 0x90;
                }
                else {
                    throw new DecodeError_1.DecodeError(`Unrecognized array type byte: ${(0, prettyByte_1.prettyByte)(headByte)}`);
                }
            }
        }
    }
    pushMapState(size) {
        if (size > this.maxMapLength) {
            throw new DecodeError_1.DecodeError(`Max length exceeded: map length (${size}) > maxMapLengthLength (${this.maxMapLength})`);
        }
        this.stack.pushMapState(size);
    }
    pushArrayState(size) {
        if (size > this.maxArrayLength) {
            throw new DecodeError_1.DecodeError(`Max length exceeded: array length (${size}) > maxArrayLength (${this.maxArrayLength})`);
        }
        this.stack.pushArrayState(size);
    }
    decodeString(byteLength, headerOffset) {
        if (this.stateIsMapKey() ? this.rawBinaryStringKeys : this.rawBinaryStringValues) {
            const decoded = this.decodeBinary(byteLength, headerOffset);
            if (this.useRawBinaryStringClass) {
                return new typedArrays_1.RawBinaryString(decoded);
            }
            return decoded;
        }
        return this.decodeUtf8String(byteLength, headerOffset);
    }
    decodeUtf8String(byteLength, headerOffset) {
        var _a;
        if (byteLength > this.maxStrLength) {
            throw new DecodeError_1.DecodeError(`Max length exceeded: UTF-8 byte length (${byteLength}) > maxStrLength (${this.maxStrLength})`);
        }
        if (this.bytes.byteLength < this.pos + headerOffset + byteLength) {
            throw MORE_DATA;
        }
        const offset = this.pos + headerOffset;
        let object;
        if (this.stateIsMapKey() && ((_a = this.keyDecoder) === null || _a === void 0 ? void 0 : _a.canBeCached(byteLength))) {
            object = this.keyDecoder.decode(this.bytes, offset, byteLength);
        }
        else {
            object = (0, utf8_1.utf8Decode)(this.bytes, offset, byteLength);
        }
        this.pos += headerOffset + byteLength;
        return object;
    }
    stateIsMapKey() {
        if (this.stack.length > 0) {
            const state = this.stack.top();
            return state.type === STATE_MAP_KEY;
        }
        return false;
    }
    decodeBinary(byteLength, headOffset) {
        if (byteLength > this.maxBinLength) {
            throw new DecodeError_1.DecodeError(`Max length exceeded: bin length (${byteLength}) > maxBinLength (${this.maxBinLength})`);
        }
        if (!this.hasRemaining(byteLength + headOffset)) {
            throw MORE_DATA;
        }
        const offset = this.pos + headOffset;
        const object = this.bytes.subarray(offset, offset + byteLength);
        this.pos += headOffset + byteLength;
        return object;
    }
    decodeExtension(size, headOffset) {
        if (size > this.maxExtLength) {
            throw new DecodeError_1.DecodeError(`Max length exceeded: ext length (${size}) > maxExtLength (${this.maxExtLength})`);
        }
        const extType = this.view.getInt8(this.pos + headOffset);
        const data = this.decodeBinary(size, headOffset + 1 /* extType */);
        return this.extensionCodec.decode(data, extType, this.context);
    }
    convertNumber(value) {
        return (0, int_1.convertSafeIntegerToMode)(value, this.intMode);
    }
    lookU8() {
        return this.view.getUint8(this.pos);
    }
    lookU16() {
        return this.view.getUint16(this.pos);
    }
    lookU32() {
        return this.view.getUint32(this.pos);
    }
    readU8() {
        const value = this.view.getUint8(this.pos);
        this.pos++;
        return value;
    }
    readI8() {
        const value = this.view.getInt8(this.pos);
        this.pos++;
        return value;
    }
    readU16() {
        const value = this.view.getUint16(this.pos);
        this.pos += 2;
        return value;
    }
    readI16() {
        const value = this.view.getInt16(this.pos);
        this.pos += 2;
        return value;
    }
    readU32() {
        const value = this.view.getUint32(this.pos);
        this.pos += 4;
        return value;
    }
    readI32() {
        const value = this.view.getInt32(this.pos);
        this.pos += 4;
        return value;
    }
    readU64() {
        const value = (0, int_1.getUint64)(this.view, this.pos, this.intMode);
        this.pos += 8;
        return value;
    }
    readI64() {
        const value = (0, int_1.getInt64)(this.view, this.pos, this.intMode);
        this.pos += 8;
        return value;
    }
    readF32() {
        const value = this.view.getFloat32(this.pos);
        this.pos += 4;
        return value;
    }
    readF64() {
        const value = this.view.getFloat64(this.pos);
        this.pos += 8;
        return value;
    }
}
exports.Decoder = Decoder;
//# sourceMappingURL=Decoder.js.map
/**
 * Polyfills for the ES2026 Uint8Array hex methods (toHex/fromHex).
 * pdfjs-dist 5.x calls `uint8array.toHex()` when computing document
 * fingerprints, which throws "n.toHex is not a function" on browsers
 * that predate this API. Spec: https://tc39.es/proposal-arraybuffer-base64/
 */

declare global {
  interface Uint8Array {
    toHex?(): string;
  }
  interface Uint8ArrayConstructor {
    fromHex?(hexString: string): Uint8Array;
  }
}

if (!Uint8Array.prototype.toHex) {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: function toHex(this: Uint8Array): string {
      let out = "";
      for (let i = 0; i < this.length; i++) {
        out += this[i].toString(16).padStart(2, "0");
      }
      return out;
    },
    writable: true,
    configurable: true,
  });
}

if (!Uint8Array.fromHex) {
  Object.defineProperty(Uint8Array, "fromHex", {
    value: function fromHex(hexString: string): Uint8Array {
      if (
        typeof hexString !== "string" ||
        hexString.length % 2 !== 0 ||
        /[^0-9a-fA-F]/.test(hexString)
      ) {
        throw new SyntaxError("Invalid hexadecimal string");
      }
      const out = new Uint8Array(hexString.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    },
    writable: true,
    configurable: true,
  });
}

export {};

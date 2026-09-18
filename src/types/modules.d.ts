/**
 * Type declarations for modules that ship without types.
 */

/**
 * Mammoth's browser build.
 *
 * The package ships `mammoth.browser.js` as a pre-bundled UMD file with no
 * accompanying `.d.ts`. It exposes the same API surface as the main entry, so
 * the shape Seigem uses is declared here.
 */
declare module "mammoth/mammoth.browser.js" {
  export interface MammothMessage {
    type: string;
    message: string;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export type MammothInput = { arrayBuffer: ArrayBuffer } | { buffer: Buffer };

  export function extractRawText(input: MammothInput): Promise<MammothResult>;
  export function convertToHtml(
    input: MammothInput,
    options?: Record<string, unknown>,
  ): Promise<MammothResult>;
}

declare module "mammoth/mammoth.browser" {
  type ExtractResult = { value: string };

  type MammothBrowser = {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<ExtractResult>;
  };

  const mammoth: MammothBrowser;
  export default mammoth;
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractResult>;
}

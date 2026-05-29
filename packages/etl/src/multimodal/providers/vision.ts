import { basename } from "path";
import type { ExtractedImage, ImageDescription } from "@groundedos/core";

export interface ImageDescriptionProvider {
  readonly name: string;
  describe(image: ExtractedImage): Promise<ImageDescription>;
}

export interface VisionModelProvider extends ImageDescriptionProvider {}

export class MockVisionProvider implements VisionModelProvider {
  readonly name: string = "mock-vision";

  async describe(image: ExtractedImage): Promise<ImageDescription> {
    const filename = basename(image.extractedPath);
    return {
      assetId: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      shortCaption: `Image extracted from page ${image.pageNumber}`,
      detailedDescription: `Visual summary generated for ${filename}.`,
      detectedObjects: ["diagram"],
      detectedTextSummary: `Potential text detected in ${filename}.`,
      diagramType: "unknown",
      tableLikeStructure: false,
      semanticTags: ["pdf", "image", "extracted"],
      confidence: 0.86,
      provider: this.name,
      model: "mock-v1",
      createdAt: new Date().toISOString(),
    };
  }
}

export class LocalVisionProvider extends MockVisionProvider {
  readonly name = "local-vision";
}

export class CloudVisionProvider extends MockVisionProvider {
  readonly name = "cloud-vision";
}

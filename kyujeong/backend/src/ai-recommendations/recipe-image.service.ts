import { Injectable } from '@nestjs/common';

type RecipeImageInput = {
  menuName: string;
  ingredients: string[];
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

@Injectable()
export class RecipeImageService {
  getStatus() {
    const openAiApiKey = process.env.OPENAI_API_KEY?.trim();

    return {
      configured: Boolean(openAiApiKey),
      enabled: this.isEnabled() && Boolean(openAiApiKey),
      model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
    };
  }

  async createThumbnail(input: RecipeImageInput) {
    const openAiApiKey = process.env.OPENAI_API_KEY?.trim();

    if (!this.isEnabled() || !openAiApiKey) {
      return null;
    }

    const imageBase64 = await this.createOpenAiThumbnail(input, openAiApiKey);

    return imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : null;
  }

  private async createOpenAiThumbnail(
    input: RecipeImageInput,
    openAiApiKey: string,
  ) {
    try {
      const response = await fetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
            prompt: this.buildPrompt(input),
            size: process.env.OPENAI_IMAGE_SIZE ?? '1024x1024',
            quality: process.env.OPENAI_IMAGE_QUALITY ?? 'low',
            output_format: 'jpeg',
          }),
          signal: AbortSignal.timeout(90000),
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as OpenAiImageResponse;

      return data.data?.[0]?.b64_json ?? null;
    } catch {
      return null;
    }
  }

  private buildPrompt(input: RecipeImageInput) {
    const ingredients =
      input.ingredients.slice(0, 6).join(', ') || 'home ingredients';

    return [
      'Create a premium editorial food thumbnail for a Korean refrigerator recipe board.',
      `Dish: ${input.menuName}.`,
      `Visible ingredients: ${ingredients}.`,
      'Top-down or three-quarter angle, natural kitchen light, clean plate, appetizing but realistic home cooking.',
      'No people, no hands, no text, no logo, no watermark, no UI elements.',
    ].join(' ');
  }

  private isEnabled() {
    const flag =
      process.env.OPENAI_IMAGE_GENERATION_ENABLED?.trim().toLowerCase();

    return flag === 'true' || flag === '1' || flag === 'yes';
  }
}

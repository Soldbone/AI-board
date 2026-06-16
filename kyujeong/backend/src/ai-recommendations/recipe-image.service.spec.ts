import { RecipeImageService } from './recipe-image.service';

describe('RecipeImageService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let service: RecipeImageService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: '',
      OPENAI_IMAGE_GENERATION_ENABLED: '',
      OPENAI_IMAGE_MODEL: 'gpt-image-1',
      OPENAI_IMAGE_SIZE: '1024x1024',
      OPENAI_IMAGE_QUALITY: 'low',
    };
    service = new RecipeImageService();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('should report disabled status without an API key', () => {
    expect(service.getStatus()).toEqual({
      configured: false,
      enabled: false,
      model: 'gpt-image-1',
    });
  });

  it('should skip image generation when the feature flag is off', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(
      service.createThumbnail({
        menuName: '참치김밥',
        ingredients: ['참치', '김', '밥'],
      }),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should create a data URL when image generation is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_IMAGE_GENERATION_ENABLED = 'true';
    process.env.OPENAI_IMAGE_MODEL = 'custom-image-model';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            b64_json: 'generated-image',
          },
        ],
      }),
    } as unknown as Response) as unknown as typeof fetch;

    await expect(
      service.createThumbnail({
        menuName: '참치김밥',
        ingredients: ['참치', '김', '밥'],
      }),
    ).resolves.toBe('data:image/jpeg;base64,generated-image');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
        body: expect.stringContaining('custom-image-model'),
      }),
    );
  });
});

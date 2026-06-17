import { FoodMetadataService } from '../food-metadata.service';
import { StdioJsonRpcTransport } from './stdio-json-rpc';

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

const SERVER_INFO = {
  name: 'korean-food-metadata-mcp',
  version: '0.1.0',
};

const TOOLS = [
  {
    name: 'search_food_items',
    title: 'Search Korean Food Items',
    description:
      'Search public Korean food nutrition records by a user-provided food name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Korean food or ingredient name, such as 계란 or 두부.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of candidates to return.',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_food_nutrition',
    title: 'Get Food Nutrition',
    description:
      'Fetch structured nutrition metadata for one food item candidate.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Food or ingredient name to look up.',
        },
        foodId: {
          type: 'string',
          description:
            'Optional food identifier from search_food_items when a specific candidate should be used.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_ingredients_nutrition',
    title: 'Analyze Ingredient Nutrition Metadata',
    description:
      'Summarize nutrition metadata for multiple ingredient names without choosing a dish.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 20,
          description: 'Food or ingredient names to look up together.',
        },
      },
      required: ['ingredients'],
    },
  },
];

export class FoodMetadataMcpServer {
  constructor(
    private readonly transport = new StdioJsonRpcTransport(),
    private readonly foodMetadataService = new FoodMetadataService(),
  ) {}

  start() {
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.start();
  }

  private async handleMessage(message: {
    id?: string | number | null;
    method: string;
    params?: unknown;
  }) {
    if (message.method.startsWith('notifications/')) {
      return;
    }

    const id = message.id ?? null;

    try {
      switch (message.method) {
        case 'initialize':
          this.transport.sendResult(id, {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: SERVER_INFO,
          });
          return;

        case 'ping':
          this.transport.sendResult(id, {});
          return;

        case 'tools/list':
          this.transport.sendResult(id, { tools: TOOLS });
          return;

        case 'tools/call':
          await this.callTool(id, message.params);
          return;

        default:
          this.transport.sendError(
            id,
            -32601,
            `Unknown MCP method: ${message.method}`,
          );
      }
    } catch (error) {
      this.transport.sendError(
        id,
        -32603,
        error instanceof Error ? error.message : 'Internal MCP server error.',
      );
    }
  }

  private async callTool(id: string | number | null, params: unknown) {
    const toolCall = this.asToolCallParams(params);

    if (!toolCall.name) {
      this.transport.sendError(id, -32602, 'Tool name is required.');
      return;
    }

    const args = toolCall.arguments ?? {};
    let structuredContent: unknown;

    switch (toolCall.name) {
      case 'search_food_items':
        structuredContent = await this.foodMetadataService.searchFoodItems(
          this.readRequiredString(args.query, 'query'),
          this.readOptionalLimit(args.limit),
        );
        break;

      case 'get_food_nutrition':
        structuredContent = await this.foodMetadataService.getFoodNutrition(
          this.readRequiredString(args.query, 'query'),
          this.readOptionalString(args.foodId),
        );
        break;

      case 'analyze_ingredients_nutrition':
        structuredContent =
          await this.foodMetadataService.analyzeIngredientsNutrition(
            this.readRequiredStringArray(args.ingredients, 'ingredients'),
          );
        break;

      default:
        this.transport.sendError(id, -32602, `Unknown tool: ${toolCall.name}`);
        return;
    }

    this.transport.sendResult(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent),
        },
      ],
      structuredContent,
    });
  }

  private asToolCallParams(value: unknown): ToolCallParams {
    return value && typeof value === 'object' ? value : {};
  }

  private readRequiredString(value: unknown, name: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} must be a non-empty string.`);
    }

    return value.trim();
  }

  private readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readOptionalLimit(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(Math.max(Math.floor(value), 1), 50)
      : 10;
  }

  private readRequiredStringArray(value: unknown, name: string) {
    if (!Array.isArray(value)) {
      throw new Error(`${name} must be an array of strings.`);
    }

    const strings = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (strings.length === 0) {
      throw new Error(`${name} must include at least one non-empty string.`);
    }

    return strings;
  }
}

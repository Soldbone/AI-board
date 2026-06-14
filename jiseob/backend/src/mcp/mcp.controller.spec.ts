import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { MCP_TOOLS, McpTool } from './mcp.types';

describe('McpController', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };

  const execute = jest.fn().mockResolvedValue({ ok: true });
  const tool: McpTool = {
    definition: {
      name: 'sample.echo',
      description: 'Echoes arguments',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    },
    execute,
  };

  let app: INestApplication;

  beforeEach(async () => {
    execute.mockClear();

    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpServerService,
        {
          provide: MCP_TOOLS,
          useValue: [tool],
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            headers: Record<string, string>;
            user?: typeof user;
          }>();

          if (httpRequest.headers.authorization !== 'Bearer test-token') {
            throw new UnauthorizedException();
          }

          httpRequest.user = user;

          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests without a bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
      .expect(401);
  });

  it('returns tools/list result through the HTTP endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set('Authorization', 'Bearer test-token')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              {
                name: 'sample.echo',
                annotations: {
                  readOnlyHint: true,
                },
              },
            ],
          },
        });
      });
  });

  it('returns tools/call result through the HTTP endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set('Authorization', 'Bearer test-token')
      .send({
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: 'sample.echo',
          arguments: {
            message: 'hello',
          },
        },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          jsonrpc: '2.0',
          id: 'call-1',
          result: {
            content: [
              {
                type: 'text',
                text: '{"ok":true}',
              },
            ],
            structuredContent: {
              ok: true,
            },
            isError: false,
          },
        });
      });
    expect(execute).toHaveBeenCalledWith({ message: 'hello' }, { user });
  });
});

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type MessageHandler = (message: JsonRpcRequest) => Promise<void> | void;

export class StdioJsonRpcTransport {
  private buffer = Buffer.alloc(0);
  private readonly handlers: MessageHandler[] = [];

  constructor(
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly output: NodeJS.WriteStream = process.stdout,
  ) {}

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  start() {
    this.input.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      void this.processBuffer();
    });
  }

  sendResult(id: string | number | null, result: unknown) {
    this.send({ jsonrpc: '2.0', id, result });
  }

  sendError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ) {
    this.send({ jsonrpc: '2.0', id, error: { code, message, data } });
  }

  private send(response: JsonRpcResponse) {
    const body = Buffer.from(JSON.stringify(response), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`);
    this.output.write(Buffer.concat([header, body]));
  }

  private async processBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');

      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);

      if (!contentLengthMatch) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) {
        return;
      }

      const rawMessage = this.buffer
        .subarray(messageStart, messageEnd)
        .toString('utf8');
      this.buffer = this.buffer.subarray(messageEnd);

      await this.dispatch(rawMessage);
    }
  }

  private async dispatch(rawMessage: string) {
    let message: JsonRpcRequest;

    try {
      message = JSON.parse(rawMessage) as JsonRpcRequest;
    } catch {
      this.sendError(null, -32700, 'Parse error');
      return;
    }

    for (const handler of this.handlers) {
      await handler(message);
    }
  }
}

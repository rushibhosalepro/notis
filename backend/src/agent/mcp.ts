import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
type Transport = StdioClientTransport | StreamableHTTPClientTransport;

export class MCP {
  private client: Client;
  private connected = false;

  constructor(name: string, version = "1.0.0") {
    this.client = new Client({ name, version }, { capabilities: {} });
  }
  private ensureConnected(): void {
    if (!this.connected) throw new Error(`MCPClient not connected`);
  }
  async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<Tool[]> {
    this.ensureConnected();
    const { tools } = await this.client.listTools();
    return tools;
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.ensureConnected();
    const result = await this.client.callTool({ name, arguments: args });

    return (result?.content[0] as { text: string }).text;
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}

export async function createStdioClient(
  name: string,
  command: string,
  args: string[],
): Promise<MCP> {
  const mcpClient = new MCP(name);
  await mcpClient.connect(new StdioClientTransport({ command, args }));
  return mcpClient;
}
export async function createHttpClient(
  name: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<MCP> {
  const mcpClient = new MCP(name);
  await mcpClient.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    }),
  );
  return mcpClient;
}

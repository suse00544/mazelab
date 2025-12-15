
// MCP Client - Streamable HTTP Transport (2025-03-26 Specification)
// https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPLog {
  timestamp: number;
  type: 'info' | 'error' | 'send' | 'recv';
  message: string;
  data?: any;
}

export class MCPClient {
  private baseUrl: string = '';
  private sessionId: string | null = null;
  private onLog: (log: MCPLog) => void;
  private _isConnected: boolean = false;
  private sseAbortController: AbortController | null = null;
  private requestId: number = 1;

  constructor(onLog: (log: MCPLog) => void) {
    this.onLog = onLog;
  }

  get isConnected() {
    return this._isConnected;
  }

  private log(type: MCPLog['type'], message: string, data?: any) {
    this.onLog({
      timestamp: Date.now(),
      type,
      message,
      data
    });
  }

  /**
   * Connect to MCP Server using Streamable HTTP Transport
   * This performs the initialize handshake and stores the session ID
   */
  async connect(url: string): Promise<void> {
    this.disconnect();
    this.baseUrl = url;
    this.log('info', `Connecting to MCP server: ${url}`);

    try {
      // Call initialize via backend proxy
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {
          roots: { listChanged: false },
          sampling: {}
        },
        clientInfo: {
          name: 'MazeLabWebClient',
          version: '1.0.0'
        }
      });

      this._isConnected = true;
      this.log('info', 'Connected successfully!', result);

      // Send initialized notification
      await this.sendNotification('notifications/initialized', {});
      
    } catch (e: any) {
      this._isConnected = false;
      this.log('error', `Connection failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * Send a JSON-RPC request via POST
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = this.requestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    this.log('send', `→ ${method}`, payload);

    // Use backend proxy
    const proxyUrl = `/api/mcp/proxy`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetUrl: this.baseUrl,
        sessionId: this.sessionId,
        payload
      })
    });

    // Extract session ID from response if present
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId && !this.sessionId) {
      this.sessionId = newSessionId;
      this.log('info', `Session established: ${this.sessionId}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('text/event-stream')) {
      // Handle SSE streaming response
      return this.handleSSEResponse(response);
    } else {
      // Handle JSON response
      const text = await response.text();
      if (!text) return null;

      const json = JSON.parse(text);
      this.log('recv', `← ${method}`, json);

      if (json.error) {
        throw new Error(`MCP Error ${json.error.code}: ${json.error.message}`);
      }

      // Update session ID if returned in response body
      if (json.sessionId && !this.sessionId) {
        this.sessionId = json.sessionId;
        this.log('info', `Session from body: ${this.sessionId}`);
      }

      return json.result;
    }
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    const payload = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.log('send', `→ ${method} (notification)`, payload);

    const proxyUrl = `/api/mcp/proxy`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetUrl: this.baseUrl,
        sessionId: this.sessionId,
        payload
      })
    });
  }

  /**
   * Handle SSE streaming response
   */
  private async handleSSEResponse(response: Response): Promise<any> {
    if (!response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            if (data) {
              try {
                const json = JSON.parse(data);
                this.log('recv', '← SSE data', json);
                if (json.result !== undefined) {
                  result = json.result;
                }
              } catch (e) {
                // Not JSON, skip
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return result;
  }

  /**
   * Initialize the connection (already done in connect)
   */
  async initialize(): Promise<any> {
    // Already initialized in connect(), return cached status
    return { status: 'already_initialized', sessionId: this.sessionId };
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return result?.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  /**
   * List resources
   */
  async listResources(): Promise<any[]> {
    const result = await this.sendRequest('resources/list', {});
    return result?.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    return this.sendRequest('resources/read', { uri });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }
    this._isConnected = false;
    this.sessionId = null;
    this.baseUrl = '';
    this.log('info', 'Disconnected');
  }
}

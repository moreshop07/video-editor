type MessageCallback = (data: unknown) => void;

export class ProjectWebSocket {
  private ws: WebSocket | null = null;
  private projectId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private jobProgressCallbacks: MessageCallback[] = [];
  private projectSyncCallbacks: MessageCallback[] = [];
  private autoSaveAckCallbacks: MessageCallback[] = [];
  private isManualClose = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  connect(): void {
    const token = localStorage.getItem("auth_token") || "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/api/v1/ws/${this.projectId}?token=${token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`WebSocket connected for project ${this.projectId}`);
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case "job_progress":
            this.jobProgressCallbacks.forEach((cb) => cb(message.data));
            break;
          case "job_status":
            this.jobProgressCallbacks.forEach((cb) => cb(message.payload));
            break;
          case "project_sync":
            this.projectSyncCallbacks.forEach((cb) => cb(message.data));
            break;
          case "auto_save_ack":
            this.autoSaveAckCallbacks.forEach((cb) => cb(message));
            break;
          default:
            console.log("Unknown WebSocket message type:", message.type);
        }
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    this.ws.onclose = () => {
      if (!this.isManualClose) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error("WebSocket error:", error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max WebSocket reconnect attempts reached");
      return;
    }

    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendProjectUpdate(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "project_update",
          data,
        }),
      );
    }
  }

  sendAutoSave(projectData: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "auto_save",
          project_data: projectData,
        }),
      );
    }
  }

  onJobProgress(callback: MessageCallback): () => void {
    this.jobProgressCallbacks.push(callback);
    return () => {
      this.jobProgressCallbacks = this.jobProgressCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onProjectSync(callback: MessageCallback): () => void {
    this.projectSyncCallbacks.push(callback);
    return () => {
      this.projectSyncCallbacks = this.projectSyncCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onAutoSaveAck(callback: MessageCallback): () => void {
    this.autoSaveAckCallbacks.push(callback);
    return () => {
      this.autoSaveAckCallbacks = this.autoSaveAckCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  disconnect(): void {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

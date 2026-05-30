export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  status?: "pending" | "running" | "done" | "error";
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  file?: File;
  toolCalls?: ToolCall[];
  id: string;
  clarification?: {
    id: string;
    question: string;
    options: string[];
    answered: boolean;
  };
}

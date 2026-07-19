export interface AgentStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  path: string;
  port: number;
}

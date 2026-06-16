export enum AgentRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum AgentStepType {
  MODEL = 'MODEL',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
  FINAL = 'FINAL',
}

export enum AgentStepStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

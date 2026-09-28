-- A local, OpenAI-compatible model server (Ollama, LM Studio, vLLM) for the agents.
ALTER TABLE "AgentPolicy" ADD COLUMN "aiBaseUrl" TEXT;

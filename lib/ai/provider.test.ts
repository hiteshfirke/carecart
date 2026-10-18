import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfigured, aiProvider } from "./provider";

afterEach(() => vi.unstubAllEnvs());

describe("aiProvider", () => {
  it("defaults to anthropic, so existing setups keep using Claude", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(aiProvider()).toBe("anthropic");
  });

  it("switches to an OpenAI-compatible API when AI_PROVIDER says so", () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    expect(aiProvider()).toBe("openai-compatible");
  });
});

describe("aiConfigured", () => {
  it("needs ANTHROPIC_API_KEY for anthropic", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(aiConfigured()).toBe(true);
  });

  it("needs base URL, key and model for an OpenAI-compatible API", () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", "https://api.groq.com/openai/v1");
    vi.stubEnv("AI_API_KEY", "gsk_test");
    vi.stubEnv("AI_MODEL", "");
    expect(aiConfigured()).toBe(false);
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b");
    expect(aiConfigured()).toBe(true);
  });
});

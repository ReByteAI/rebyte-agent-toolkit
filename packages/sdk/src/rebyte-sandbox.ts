import type { EnvironmentParam, HostedSkillParam, RebyteGitHubSkillParam } from './resources/beta/agents/agents';

/** A Rebyte-managed, session-isolated Sandbox. Provisioned lazily by the API. */
export type RebyteSandbox = Omit<EnvironmentParam.EnvironmentParamOpenAIHosted,
  'environment_template_id' | 'plugins' | 'skills'> & {
    skills?: Array<HostedSkillParam.HostedSkillParamInline | RebyteGitHubSkillParam> | null;
  };
export type RebyteSandboxOptions = Omit<RebyteSandbox, 'type'>;

/** Configure Rebyte compute while preserving the OpenAI-compatible wire discriminator. */
export function rebyteSandbox(options: RebyteSandboxOptions = {}): RebyteSandbox {
  return { ...options, type: 'openai_hosted' };
}

/** Rebyte extension: install a GitHub Skill when the Session Sandbox is created. */
export interface RebyteGitHubSkillParam { type: 'github'; url: string; name?: string }

import type { EnvironmentParam, HostedSkillParam } from 'openai/resources/beta/agents/agents';

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

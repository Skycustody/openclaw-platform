/**
 * Install default platform skills into a new user's container at provisioning time.
 * Uses the same skills as the Skill Marketplace — fetched from GitHub.
 */
import { sshExec } from './ssh';
import { readContainerConfig, writeContainerConfig, restartContainer } from './containerConfig';
import { PLATFORM_SKILLS, SKILLS_REPO_URL } from '../data/platformSkills';

const INSTANCE_DIR = '/opt/openclaw/instances';

/**
 * Install all default platform skills into a user's instance.
 * Called during provisioning so new users get browser-use, job-auto-apply, etc. by default.
 */
export async function installDefaultSkills(
  serverIp: string,
  userId: string,
  containerName: string
): Promise<void> {
  const skillsDir = `${INSTANCE_DIR}/${userId}/skills`;
  const tmpDir = `/tmp/openclaw-default-skills-${userId}-${Date.now()}`;

  try {
    // Clone once, copy all skills, cleanup
    const copyCmds = PLATFORM_SKILLS.map(
      s => `cp -r ${tmpDir}/skills/${s.repoPath} ${skillsDir}/${s.id}`
    ).join(' && ');

    const cmd = [
      `mkdir -p ${skillsDir}`,
      `git clone --depth 1 ${SKILLS_REPO_URL} ${tmpDir}`,
      copyCmds,
      `rm -rf ${tmpDir}`,
    ].join(' && ');

    await sshExec(serverIp, cmd);

    // Enable all in openclaw.json
    const config = await readContainerConfig(serverIp, userId);
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};
    for (const skill of PLATFORM_SKILLS) {
      config.skills.entries[skill.id] = { enabled: true };
    }
    await writeContainerConfig(serverIp, userId, config);

    await restartContainer(serverIp, containerName);
    console.log(`[provision] Installed ${PLATFORM_SKILLS.length} default skills for ${userId}`);
  } catch (err) {
    console.warn(`[provision] Failed to install default skills (non-fatal):`, err);
    // Don't fail provisioning — user can install from marketplace later
  }
}

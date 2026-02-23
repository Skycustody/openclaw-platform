/**
 * Install default platform skills into a new user's container at provisioning time.
 * Copies from the control plane's verified skills dir (no GitHub clone).
 * Run scripts/install-skills-from-github.sh on the control plane to populate that dir.
 */
import fs from 'fs';
import { sshUploadDir } from './ssh';
import { readContainerConfig, writeContainerConfig, restartContainer } from './containerConfig';
import { PLATFORM_SKILLS } from '../data/platformSkills';
import { cacheUserSkills } from './smartRouter';

const INSTANCE_DIR = '/opt/openclaw/instances';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

/** Path on the control plane where verified skills live (populated by install-skills-from-github.sh). */
export const PLATFORM_SKILLS_DIR = process.env.PLATFORM_SKILLS_DIR || '/opt/openclaw-platform/skills';

/**
 * Install all default platform skills into a user's instance.
 * Copies from control plane PLATFORM_SKILLS_DIR to the worker — no clone, uses pre-verified skills.
 */
export async function installDefaultSkills(
  serverIp: string,
  userId: string,
  containerName: string
): Promise<void> {
  if (!fs.existsSync(PLATFORM_SKILLS_DIR)) {
    console.warn(`[provision] PLATFORM_SKILLS_DIR missing (${PLATFORM_SKILLS_DIR}), skipping default skills. Run install-skills-from-github.sh on the control plane.`);
    return;
  }

  try {
    validateUserId(userId);
    const remoteSkillsDir = `${INSTANCE_DIR}/${userId}/skills`;
    await sshUploadDir(serverIp, PLATFORM_SKILLS_DIR, remoteSkillsDir);

    // Enable all in openclaw.json
    const config = await readContainerConfig(serverIp, userId);
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};
    for (const skill of PLATFORM_SKILLS) {
      config.skills.entries[skill.id] = { enabled: true };
    }
    await writeContainerConfig(serverIp, userId, config);
    cacheUserSkills(userId, PLATFORM_SKILLS.map(s => s.id)).catch(() => {});

    await restartContainer(serverIp, containerName);
    console.log(`[provision] Installed default skills from control plane for ${userId}`);
  } catch (err) {
    console.warn(`[provision] Failed to install default skills (non-fatal):`, err);
    // Don't fail provisioning — user can install from marketplace later
  }
}

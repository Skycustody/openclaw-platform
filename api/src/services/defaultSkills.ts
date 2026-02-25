/**
 * Install default platform skills into a new user's container at provisioning time.
 * Copies from the control plane's verified skills dir (no GitHub clone).
 * Run scripts/install-skills-from-github.sh on the control plane to populate that dir.
 *
 * Platform-bundled skills (api/skills/) are always uploaded alongside GitHub-sourced ones.
 */
import fs from 'fs';
import path from 'path';
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

/** Bundled skills shipped with the API (always available, no GitHub clone needed). */
const BUNDLED_SKILLS_DIR = path.resolve(__dirname, '../../skills');

/**
 * Upload skill files + enable in config. No container restart.
 * Use during provisioning BEFORE docker run — container starts with skills already in place.
 */
export async function preInstallSkills(
  serverIp: string,
  userId: string,
): Promise<void> {
  try {
    validateUserId(userId);
    const remoteSkillsDir = `${INSTANCE_DIR}/${userId}/skills`;

    // Upload GitHub-sourced skills (if available)
    if (fs.existsSync(PLATFORM_SKILLS_DIR)) {
      await sshUploadDir(serverIp, PLATFORM_SKILLS_DIR, remoteSkillsDir);
    } else {
      console.warn(`[provision] PLATFORM_SKILLS_DIR missing (${PLATFORM_SKILLS_DIR}), skipping GitHub skills.`);
    }

    // Always upload bundled platform skills (switch-model, etc.)
    if (fs.existsSync(BUNDLED_SKILLS_DIR)) {
      await sshUploadDir(serverIp, BUNDLED_SKILLS_DIR, remoteSkillsDir);
    }

    const config = await readContainerConfig(serverIp, userId);
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};
    for (const skill of PLATFORM_SKILLS) {
      config.skills.entries[skill.id] = { enabled: true };
    }
    await writeContainerConfig(serverIp, userId, config);
    cacheUserSkills(userId, PLATFORM_SKILLS.map(s => s.id)).catch(() => {});
    console.log(`[provision] Pre-installed default skills for ${userId}`);
  } catch (err) {
    console.warn(`[provision] Failed to pre-install default skills (non-fatal):`, err);
  }
}

/**
 * Install default skills into a running container (uploads + config + restart).
 * Use when adding skills to an existing running container.
 */
export async function installDefaultSkills(
  serverIp: string,
  userId: string,
  containerName: string
): Promise<void> {
  try {
    validateUserId(userId);
    const remoteSkillsDir = `${INSTANCE_DIR}/${userId}/skills`;

    if (fs.existsSync(PLATFORM_SKILLS_DIR)) {
      await sshUploadDir(serverIp, PLATFORM_SKILLS_DIR, remoteSkillsDir);
    } else {
      console.warn(`[provision] PLATFORM_SKILLS_DIR missing (${PLATFORM_SKILLS_DIR}), skipping GitHub skills.`);
    }

    if (fs.existsSync(BUNDLED_SKILLS_DIR)) {
      await sshUploadDir(serverIp, BUNDLED_SKILLS_DIR, remoteSkillsDir);
    }

    const config = await readContainerConfig(serverIp, userId);
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};
    for (const skill of PLATFORM_SKILLS) {
      config.skills.entries[skill.id] = { enabled: true };
    }
    await writeContainerConfig(serverIp, userId, config);
    cacheUserSkills(userId, PLATFORM_SKILLS.map(s => s.id)).catch(() => {});

    await restartContainer(serverIp, containerName);
    console.log(`[provision] Installed default skills for ${userId}`);
  } catch (err) {
    console.warn(`[provision] Failed to install default skills (non-fatal):`, err);
  }
}

/**
 * Deploys firestore.rules straight to the Firebase Rules API using the
 * service account, so no firebase-tools login is needed.
 *
 *   node server/deploy-rules.mjs
 *
 * It creates a new ruleset, then points the `cloud.firestore` release at it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseConfig, getAccessToken } from './firebase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = firebaseConfig.projectId;

const api = async (url, options = {}) => {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
};

const createRuleset = async (file, name) => {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const result = await api(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
    method: 'POST',
    body: JSON.stringify({ source: { files: [{ name, content }] } }),
  });
  if (!result.ok) throw new Error(`ruleset ${result.status}: ${JSON.stringify(result.json).slice(0, 300)}`);
  return result.json.name;
};

const createRelease = async (releaseId, rulesetName) => {
  const releaseName = `projects/${PROJECT}/releases/${releaseId}`;
  const result = await api(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, {
    method: 'POST',
    body: JSON.stringify({ name: releaseName, rulesetName }),
  });
  if (result.ok) return { ok: true, release: releaseId };

  const isExists = result.status === 409 || JSON.stringify(result.json || {}).includes('already exists');
  if (isExists) {
    const updated = await api(
      `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/${encodeURIComponent(releaseId)}`,
      { method: 'PATCH', body: JSON.stringify({ name: releaseName, rulesetName }) }
    );
    return { ok: updated.ok, release: releaseId, status: updated.status, error: updated.ok ? null : updated.json };
  }
  return { ok: false, release: releaseId, status: result.status, error: result.json };
};

export const deployRules = async () => {
  if (!PROJECT) return { ok: false, error: 'Firebase is not configured' };
  const rulesetName = await createRuleset('firestore.rules', 'firestore.rules');
  const firestore = await createRelease('cloud.firestore', rulesetName);
  return { project: PROJECT, firestore };
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = await deployRules();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.firestore?.ok ? 0 : 1);
}

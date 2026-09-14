import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import decompress from 'decompress';
import {
	minecraftServerConfigSchema,
	type MinecraftServerConfig
} from '$lib/types/MinecraftServerConfig';
import { parseProperties, writeProperties } from './properties';

export type ProcessLogLine = {
	type: 'stdout' | 'stderr';
	line: string;
	time: number;
};

interface ServerInstance {
	process?: ChildProcess;
	logs: ProcessLogLine[];
}

const instances: Record<string, ServerInstance> = {};

function getServerDir(slug: string) {
	return path.join(process.cwd(), 'data', 'servers', slug);
}

export async function getServerConfig(slug: string): Promise<MinecraftServerConfig> {
	const serverDir = getServerDir(slug);
	const propsPath = path.join(serverDir, 'server.properties');

	let content = '';
	try {
		content = await fs.readFile(propsPath, 'utf8');
	} catch (err) {
		// File might not exist yet; we'll return default configs.
	}

	const rawConfig = parseProperties(content);
	// Zod will apply defaults for missing keys
	return minecraftServerConfigSchema.parse(rawConfig);
}

export async function setServerConfig(slug: string, configUpdates: Partial<MinecraftServerConfig>) {
	const serverDir = getServerDir(slug);
	const propsPath = path.join(serverDir, 'server.properties');

	let content = '';
	try {
		content = await fs.readFile(propsPath, 'utf8');
	} catch (err) {
		// Ignore if error reading
	}

	const newContent = writeProperties(configUpdates, content);
	await fs.mkdir(serverDir, { recursive: true });
	await fs.writeFile(propsPath, newContent, 'utf8');
}

export function getServerStatus(slug: string): 'idle' | 'stopped' | 'running' {
	const instance = instances[slug];
	if (!instance) return 'idle';
	return instance.process && instance.process.exitCode === null ? 'running' : 'stopped';
}

export function getServerLogs(slug: string): ProcessLogLine[] {
	return instances[slug]?.logs || [];
}

export async function startServer(slug: string) {
	if (getServerStatus(slug) === 'running') return;

	const serverDir = getServerDir(slug);

	// Create executable path. For Mac/Linux it's bedrock_server. For Windows it's bedrock_server.exe
	const isWin = process.platform === 'win32';
	const exeName = isWin ? 'bedrock_server.exe' : 'bedrock_server';
	const executablePath = path.join(serverDir, exeName);

	// Ensure executable permissions just in case
	if (!isWin) {
		try {
			await fs.chmod(executablePath, 0o755);
		} catch (e) {
			console.error(`Failed to chmod +x ${executablePath}`, e);
		}
	}

	const child = spawn(executablePath, [], {
		cwd: serverDir,
		env: process.env,
		stdio: ['pipe', 'pipe', 'pipe']
	});

	if (!instances[slug]) {
		instances[slug] = { logs: [] };
	}
	instances[slug].process = child;
	// Clear old logs on start
	instances[slug].logs = [];

	const addLog = (type: 'stdout' | 'stderr', data: Buffer) => {
		const lines = data.toString('utf8').split('\n');
		for (const line of lines) {
			if (!line.trim()) continue;
			instances[slug].logs.push({
				type,
				line: line.replace(/\r/g, ''),
				time: Date.now()
			});
		}
		// Keep last 1000 logs to prevent memory leaks
		if (instances[slug].logs.length > 1000) {
			instances[slug].logs = instances[slug].logs.slice(-1000);
		}
	};

	child.on('error', (err) => {
		console.error('Failed to start bedrock server process:', err);
		addLog('stderr', Buffer.from(`Failed to start server: ${err.message}`));
		instances[slug].process = undefined;
	});

	child.stdout?.on('data', (data) => addLog('stdout', data));
	child.stderr?.on('data', (data) => addLog('stderr', data));

	child.on('exit', () => {
		instances[slug].logs.push({
			type: 'stderr',
			line: `Server process exited.`,
			time: Date.now()
		});
	});
}

export function stopServer(slug: string) {
	const instance = instances[slug];
	if (instance && instance.process) {
		// Gracefully stop the bedrock server
		instance.process.stdin?.write('stop\n');
		// We could also kill it if it doesn't stop after a timeout,
		// but standard 'stop' command works for Bedrock.
	}
}

export function writeServerInput(slug: string, input: string) {
	const instance = instances[slug];
	if (instance && instance.process && instance.process.stdin) {
		instance.process.stdin.write(input + '\n');
		instance.logs.push({
			type: 'stdout',
			line: `> ${input}`,
			time: Date.now()
		});
	}
}

// ── Allowlist ─────────────────────────────────────────────────────────────────

export type AllowedPlayer = {
	name: string;
	xuid?: string;
	ignoresPlayerLimit: boolean;
};

function getAllowlistPath(slug: string) {
	return path.join(getServerDir(slug), 'allowlist.json');
}

export async function getAllowedPlayers(slug: string): Promise<AllowedPlayer[]> {
	try {
		const content = await fs.readFile(getAllowlistPath(slug), 'utf8');
		return JSON.parse(content) as AllowedPlayer[];
	} catch {
		return [];
	}
}

export async function addAllowedPlayer(slug: string, player: AllowedPlayer): Promise<void> {
	const players = await getAllowedPlayers(slug);
	if (players.some((p) => p.name.toLowerCase() === player.name.toLowerCase())) return;
	players.push(player);
	await fs.writeFile(getAllowlistPath(slug), JSON.stringify(players, null, 2), 'utf8');
	// If server is running, hot-reload the allowlist
	writeServerInput(slug, 'allowlist reload');
}

export async function removeAllowedPlayer(slug: string, name: string): Promise<void> {
	const players = await getAllowedPlayers(slug);
	const next = players.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
	await fs.writeFile(getAllowlistPath(slug), JSON.stringify(next, null, 2), 'utf8');
	writeServerInput(slug, 'allowlist reload');
}

export type MinecraftWorld = {
	id: string;
	name: string;
	lastModified: number;
	sizeBytes: number;
};

async function getDirSize(dirPath: string): Promise<number> {
	let size = 0;
	try {
		const files = await fs.readdir(dirPath, { withFileTypes: true });
		for (const file of files) {
			const fullPath = path.join(dirPath, file.name);
			if (file.isDirectory()) {
				size += await getDirSize(fullPath);
			} else {
				const stat = await fs.stat(fullPath);
				size += stat.size;
			}
		}
	} catch (e) {
		// Ignore
	}
	return size;
}

export async function getAvailableWorlds(slug: string): Promise<MinecraftWorld[]> {
	const worldsDir = path.join(getServerDir(slug), 'worlds');
	const worlds: MinecraftWorld[] = [];

	try {
		const folders = await fs.readdir(worldsDir, { withFileTypes: true });
		for (const folder of folders) {
			if (!folder.isDirectory()) continue;

			const worldPath = path.join(worldsDir, folder.name);
			let name = folder.name;
			let lastModified = 0;

			// Try to read levelname.txt
			try {
				const levelnamePath = path.join(worldPath, 'levelname.txt');
				const content = await fs.readFile(levelnamePath, 'utf8');
				if (content.trim()) {
					name = content.trim();
				}
				const stat = await fs.stat(worldPath);
				lastModified = stat.mtimeMs;
			} catch (e) {
				const stat = await fs.stat(worldPath);
				lastModified = stat.mtimeMs;
			}

			const sizeBytes = await getDirSize(worldPath);

			worlds.push({
				id: folder.name,
				name,
				lastModified,
				sizeBytes
			});
		}
	} catch (e) {
		// Worlds dir might not exist yet
	}

	return worlds.sort((a, b) => b.lastModified - a.lastModified);
}

// ── Version Update & Management ───────────────────────────────────────────────

export interface MinecraftDownloadLink {
	downloadType: string;
	downloadUrl: string;
}

export interface LatestVersionInfo {
	version: string;
	downloadUrl: string;
}

let cachedLinks: {
	data: { result?: { links?: MinecraftDownloadLink[] } };
	timestamp: number;
} | null = null;
const CACHE_TTL = 3600 * 1000; // 1 hour

async function fetchDownloadLinks() {
	if (cachedLinks && Date.now() - cachedLinks.timestamp < CACHE_TTL) {
		return cachedLinks.data;
	}
	const res = await fetch(
		'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links'
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch links: ${res.statusText}`);
	}
	const data = await res.json();
	cachedLinks = { data, timestamp: Date.now() };
	return data;
}

export async function getServerVersionInfo(
	slug: string
): Promise<{ version: string; downloadType: string; downloadUrl?: string }> {
	const serverDir = getServerDir(slug);
	const versionPath = path.join(serverDir, 'version.json');
	try {
		const content = await fs.readFile(versionPath, 'utf8');
		const info = JSON.parse(content);
		return {
			version: info.version || '1.0.0',
			downloadType: info.downloadType || 'serverBedrockLinux',
			downloadUrl: info.downloadUrl
		};
	} catch {
		return {
			version: '1.0.0',
			downloadType: 'serverBedrockLinux'
		};
	}
}

export async function getLatestVersionInfo(
	downloadType: string
): Promise<LatestVersionInfo | null> {
	try {
		const data = await fetchDownloadLinks();
		const links = (data?.result?.links || []) as MinecraftDownloadLink[];
		const link = links.find((l) => l.downloadType === downloadType);
		if (!link) return null;

		const match = link.downloadUrl.match(/bedrock-server-([\d.]+)\.zip/);
		const version = match ? match[1] : 'unknown';
		return {
			version,
			downloadUrl: link.downloadUrl
		};
	} catch (e) {
		console.error('Error fetching latest version:', e);
		return null;
	}
}

export async function updateServer(slug: string) {
	// 1. Ensure server is stopped
	if (getServerStatus(slug) === 'running') {
		throw new Error('Server must be stopped before updating.');
	}

	const versionInfo = await getServerVersionInfo(slug);
	const downloadType = versionInfo.downloadType || 'serverBedrockLinux';
	const latestInfo = await getLatestVersionInfo(downloadType);
	if (!latestInfo) {
		throw new Error('Failed to retrieve the latest version information from Minecraft services.');
	}

	if (versionInfo.version === latestInfo.version) {
		throw new Error('Server is already on the latest version.');
	}

	const serverDir = getServerDir(slug);
	const newServerDir = `${serverDir}.new`;

	// Delete existing newServerDir if it exists from a previous failed run
	await fs.rm(newServerDir, { recursive: true, force: true }).catch(() => {});
	await fs.mkdir(newServerDir, { recursive: true });

	// Download and decompress
	const res = await fetch(latestInfo.downloadUrl);
	if (!res.ok) {
		throw new Error(`Failed to download server zip: ${res.statusText}`);
	}
	const arrayBuffer = await res.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	await decompress(buffer, newServerDir);

	// Copy files
	const filesToCopy = [
		'server.properties',
		'allowlist.json',
		'worlds',
		'development_behavior_packs',
		'development_resource_packs',
		'development_skin_packs'
	];

	for (const fileName of filesToCopy) {
		const srcPath = path.join(serverDir, fileName);
		const destPath = path.join(newServerDir, fileName);
		try {
			await fs.cp(srcPath, destPath, { recursive: true });
		} catch (err: any) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}
	}

	// Write new version.json
	await fs.writeFile(
		path.join(newServerDir, 'version.json'),
		JSON.stringify(
			{
				version: latestInfo.version,
				downloadType,
				downloadUrl: latestInfo.downloadUrl
			},
			null,
			2
		),
		'utf8'
	);

	// Swap directories
	await fs.rm(serverDir, { recursive: true, force: true });
	await fs.rename(newServerDir, serverDir);
}

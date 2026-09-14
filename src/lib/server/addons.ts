import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import decompress from 'decompress';

/**
 * Addons are Bedrock pack folders installed next to the server, in
 * `behavior_packs/` and `resource_packs/`. Each pack is a folder containing a
 * `manifest.json` that declares the pack uuid, version and module types.
 */
export type AddonType = 'behavior' | 'resource';

export const addonTypes: AddonType[] = ['behavior', 'resource'];

/** Directory inside the server data dir that holds each addon type. */
export const addonDirectories: Record<AddonType, string> = {
	behavior: 'behavior_packs',
	resource: 'resource_packs'
};

/** Per-world file that enables packs for that world. */
const worldAddonFiles: Record<AddonType, string> = {
	behavior: 'world_behavior_packs.json',
	resource: 'world_resource_packs.json'
};

/** Entry format Bedrock expects in the per-world pack files. */
export interface PackReference {
	pack_id: string;
	version: number[];
}

/**
 * How much an uploaded archive is allowed to expand to once unpacked. The
 * upload itself is capped in the route; this bounds what that upload can grow
 * into on disk.
 */
export const maxExtractedAddonSize = 512 * 1024 * 1024;

export interface InstalledAddon {
	type: AddonType;
	/** Folder name inside the pack directory. */
	folder: string;
	uuid: string;
	name: string;
	description?: string;
	version: number[];
	versionLabel: string;
	hasScripts: boolean;
}

/** A folder in the pack directories that is not a usable pack. */
export interface InvalidAddon {
	type: AddonType;
	folder: string;
	reason: string;
}

export interface InstalledAddons {
	addons: InstalledAddon[];
	invalid: InvalidAddon[];
}

export interface SkippedPack {
	name: string;
	reason: string;
}

export interface InstallResult {
	installed: InstalledAddon[];
	skipped: SkippedPack[];
}

interface ManifestModule {
	type?: string;
	uuid?: string;
	version?: number[];
}

interface PackManifest {
	header?: {
		uuid?: string;
		version?: number[];
		name?: string;
		description?: string;
	};
	modules?: ManifestModule[];
}

export interface WorldAddons {
	behavior: PackReference[];
	resource: PackReference[];
}

function serverDir(slug: string): string {
	return path.join(process.cwd(), 'data', 'servers', slug);
}

export function addonDir(slug: string, type: AddonType): string {
	return path.join(serverDir(slug), addonDirectories[type]);
}

function worldDir(slug: string, worldId: string): string {
	return path.join(serverDir(slug), 'worlds', worldId);
}

async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

function formatMegabytes(bytes: number): string {
	const megabytes = bytes / (1024 * 1024);
	return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/** Total size of every file below a directory. */
async function directorySize(dir: string): Promise<number> {
	let total = 0;

	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return total;
	}

	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			total += await directorySize(entryPath);
		} else if (entry.isFile()) {
			try {
				total += (await fs.stat(entryPath)).size;
			} catch {
				// Removed while walking; nothing to count.
			}
		}
	}

	return total;
}

/**
 * Determine which pack directories a manifest belongs in. A pack can declare
 * several module types at once ("combined" packs: resources *and* data/script),
 * and each half only loads from its own directory, so such a pack is copied into
 * every matching directory. Packs that only declare module types we cannot
 * install (skin packs, world templates) return an empty list.
 */
export function addonTypesFromManifest(manifest: PackManifest): AddonType[] {
	const moduleTypes = new Set((manifest.modules ?? []).map((module) => module.type));
	const types: AddonType[] = [];

	if (moduleTypes.has('data') || moduleTypes.has('script')) types.push('behavior');
	if (moduleTypes.has('resources')) types.push('resource');

	return types;
}

function readManifestFields(manifest: PackManifest): { uuid: string; version: number[] } {
	const uuid = manifest.header?.uuid;
	const version = manifest.header?.version;

	if (typeof uuid !== 'string' || uuid.trim().length === 0) {
		throw new Error('manifest.json has no header.uuid');
	}
	if (
		!Array.isArray(version) ||
		version.length === 0 ||
		version.some((part) => typeof part !== 'number')
	) {
		throw new Error('manifest.json has no numeric header.version');
	}

	return { uuid, version };
}

function sanitizeFolderName(name: string): string {
	const cleaned = name
		.replace(/[^A-Za-z0-9 ._-]/g, '')
		.replace(/^\.+/, '')
		.trim();
	return cleaned.length > 0 ? cleaned.slice(0, 64) : 'pack';
}

/** List the pack folders installed for a server, split into usable and invalid ones. */
export async function getInstalledAddons(slug: string): Promise<InstalledAddons> {
	const addons: InstalledAddon[] = [];
	const invalid: InvalidAddon[] = [];

	for (const type of addonTypes) {
		const dir = addonDir(slug, type);

		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const manifestPath = path.join(dir, entry.name, 'manifest.json');
			if (!(await pathExists(manifestPath))) {
				invalid.push({ type, folder: entry.name, reason: 'no manifest.json' });
				continue;
			}

			let manifest: PackManifest;
			try {
				manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as PackManifest;
			} catch {
				invalid.push({ type, folder: entry.name, reason: 'manifest.json is not valid JSON' });
				continue;
			}

			try {
				const { uuid, version } = readManifestFields(manifest);

				addons.push({
					type,
					folder: entry.name,
					uuid,
					name: manifest.header?.name?.trim() || entry.name,
					description: manifest.header?.description?.trim() || undefined,
					version,
					versionLabel: version.join('.'),
					hasScripts: (manifest.modules ?? []).some((module) => module.type === 'script')
				});
			} catch (err) {
				invalid.push({
					type,
					folder: entry.name,
					reason: err instanceof Error ? err.message : 'Unreadable addon folder'
				});
			}
		}
	}

	addons.sort((a, b) => a.name.localeCompare(b.name));
	return { addons, invalid };
}

/**
 * Find the folders holding a pack with this uuid inside one pack directory. A
 * combined pack has one folder per directory, so every match has to be replaced.
 */
async function findAddonFoldersByUuid(
	slug: string,
	type: AddonType,
	uuid: string
): Promise<string[]> {
	const dir = addonDir(slug, type);
	const folders: string[] = [];

	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return folders;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		try {
			const manifest = JSON.parse(
				await fs.readFile(path.join(dir, entry.name, 'manifest.json'), 'utf8')
			) as PackManifest;
			if (manifest.header?.uuid === uuid) folders.push(entry.name);
		} catch {
			continue;
		}
	}

	return folders;
}

async function findManifests(root: string, maxDepth: number): Promise<string[]> {
	const found: string[] = [];

	async function walk(dir: string, depth: number) {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			if (entry.isFile() && entry.name === 'manifest.json') {
				found.push(entryPath);
			} else if (entry.isDirectory() && depth < maxDepth) {
				await walk(entryPath, depth + 1);
			}
		}
	}

	await walk(root, 0);
	return found;
}

/**
 * Install every pack found inside an uploaded archive (.mcpack, .mcaddon or a
 * plain zip). Packs are copied into their type directory — a combined pack, one
 * that declares both resources and data/script modules, is copied into both —
 * and an existing pack with the same uuid is replaced.
 *
 * `maxExtractedSize` bounds how much the archive is allowed to expand to. It is
 * applied after unpacking, so it catches the realistic case (a big texture pack
 * that the admin did not realise would blow up the disk) rather than a
 * deliberately crafted bomb; bounding that needs a central-directory pre-scan.
 */
export async function installAddonArchive(
	slug: string,
	data: Buffer,
	filename: string,
	options: { maxExtractedSize?: number } = {}
): Promise<InstallResult> {
	const maxExtractedSize = options.maxExtractedSize ?? maxExtractedAddonSize;
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-console-addon-'));
	const installed: InstalledAddon[] = [];
	const skipped: SkippedPack[] = [];

	try {
		await decompress(data, tempDir);

		const extractedSize = await directorySize(tempDir);
		if (extractedSize > maxExtractedSize) {
			throw new Error(
				`"${filename}" expands to ${formatMegabytes(extractedSize)}, more than the ` +
					`${formatMegabytes(maxExtractedSize)} limit.`
			);
		}

		const manifests = await findManifests(tempDir, 3);
		if (manifests.length === 0) {
			throw new Error(`"${filename}" does not contain a pack (no manifest.json found).`);
		}

		for (const manifestPath of manifests) {
			const packRoot = path.dirname(manifestPath);

			try {
				const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as PackManifest;
				const types = addonTypesFromManifest(manifest);
				if (types.length === 0) {
					skipped.push({
						name: manifest.header?.name?.trim() || path.basename(packRoot),
						reason: 'pack has no resources or data modules'
					});
					continue;
				}

				const { uuid, version } = readManifestFields(manifest);
				const baseName = sanitizeFolderName(manifest.header?.name ?? path.basename(packRoot));

				// A uuid identifies a pack, so an upload of a new version replaces every
				// folder already holding it — including the second copy of a combined pack.
				for (const type of types) {
					for (const folder of await findAddonFoldersByUuid(slug, type, uuid)) {
						await fs.rm(path.join(addonDir(slug, type), folder), {
							recursive: true,
							force: true
						});
					}
				}

				for (const type of types) {
					let folder = baseName;
					for (
						let suffix = 2;
						await pathExists(path.join(addonDir(slug, type), folder));
						suffix++
					) {
						folder = `${baseName} (${suffix})`;
					}

					const target = path.join(addonDir(slug, type), folder);
					await fs.mkdir(path.dirname(target), { recursive: true });
					// The archive was unpacked in the temp dir, which can be another filesystem.
					await fs.cp(packRoot, target, { recursive: true });

					installed.push({
						type,
						folder,
						uuid,
						name: manifest.header?.name?.trim() || folder,
						description: manifest.header?.description?.trim() || undefined,
						version,
						versionLabel: version.join('.'),
						hasScripts: (manifest.modules ?? []).some((module) => module.type === 'script')
					});
				}
			} catch (err) {
				skipped.push({
					name: path.basename(packRoot),
					reason: err instanceof Error ? err.message : 'Failed to read manifest.json'
				});
			}
		}

		return { installed, skipped };
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}

/** Delete an installed pack folder. */
export async function removeAddon(slug: string, type: AddonType, folder: string): Promise<void> {
	if (!folder || folder === '.' || folder === '..' || folder !== path.basename(folder)) {
		throw new Error('Invalid addon folder');
	}
	if (!addonTypes.includes(type)) {
		throw new Error('Invalid addon type');
	}

	const dir = path.resolve(addonDir(slug, type));
	const target = path.resolve(path.join(dir, folder));

	if (target !== path.join(dir, folder) || !target.startsWith(dir + path.sep)) {
		throw new Error('Invalid addon folder');
	}

	await fs.rm(target, { recursive: true, force: true });
}

/** Packs enabled for a world, as recorded in its world_*_packs.json files. */
export async function getWorldAddons(slug: string, worldId: string): Promise<WorldAddons> {
	const dir = worldDir(slug, worldId);

	const read = async (type: AddonType): Promise<PackReference[]> => {
		try {
			const parsed = JSON.parse(await fs.readFile(path.join(dir, worldAddonFiles[type]), 'utf8'));
			if (!Array.isArray(parsed)) return [];
			return parsed.filter(
				(entry): entry is PackReference =>
					!!entry &&
					typeof entry === 'object' &&
					typeof entry.pack_id === 'string' &&
					Array.isArray(entry.version)
			);
		} catch {
			return [];
		}
	};

	return { behavior: await read('behavior'), resource: await read('resource') };
}

/**
 * Write the per-world pack files. Entries are written exactly as Bedrock expects
 * (`pack_id` + `version`); an entry with no packs is only kept as an empty file
 * if the file already existed.
 */
export async function setWorldAddons(
	slug: string,
	worldId: string,
	addons: WorldAddons
): Promise<void> {
	const dir = worldDir(slug, worldId);

	for (const type of addonTypes) {
		const file = path.join(dir, worldAddonFiles[type]);
		const seen = new Set<string>();
		const entries = addons[type].filter((entry) => {
			if (seen.has(entry.pack_id)) return false;
			seen.add(entry.pack_id);
			return true;
		});

		if (entries.length === 0) {
			if (await pathExists(file)) {
				await fs.writeFile(file, '[]\n', 'utf8');
			}
			continue;
		}

		await fs.writeFile(file, JSON.stringify(entries, null, 2) + '\n', 'utf8');
	}
}

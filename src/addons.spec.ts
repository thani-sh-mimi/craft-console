import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { ZipArchive } from 'archiver';
import {
	addonDir,
	addonTypeFromManifest,
	getInstalledAddons,
	getWorldAddons,
	installAddonArchive,
	removeAddon,
	setWorldAddons
} from './lib/server/addons';

const slug = 'test-addons';
const serverDir = path.join(process.cwd(), 'data', 'servers', slug);

function manifest(uuid: string, version: number[], name: string, moduleTypes: string[]) {
	return JSON.stringify(
		{
			format_version: 2,
			header: { uuid: `${uuid}-header`, version, name },
			modules: moduleTypes.map((type, index) => ({
				type,
				uuid: `${uuid}-module-${index}`,
				version
			}))
		},
		null,
		2
	);
}

/** Build an in-memory zip, standing in for an uploaded .mcpack / .mcaddon. */
async function makeArchive(files: Record<string, string>): Promise<Buffer> {
	const archive = new ZipArchive({ zlib: { level: 9 } });
	const output = new PassThrough();
	const chunks: Buffer[] = [];
	output.on('data', (chunk: Buffer) => chunks.push(chunk));
	const finished = new Promise<void>((resolve) => output.on('end', () => resolve()));

	archive.pipe(output);
	for (const [name, content] of Object.entries(files)) {
		archive.append(content, { name });
	}
	await archive.finalize();
	await finished;

	return Buffer.concat(chunks);
}

describe('Addon management', () => {
	beforeEach(async () => {
		await fs.mkdir(serverDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {});
	});

	it('detects the pack type from the manifest modules', () => {
		expect(addonTypeFromManifest({ modules: [{ type: 'data' }] })).toBe('behavior');
		expect(addonTypeFromManifest({ modules: [{ type: 'script' }] })).toBe('behavior');
		expect(addonTypeFromManifest({ modules: [{ type: 'resources' }] })).toBe('resource');
		expect(addonTypeFromManifest({ modules: [{ type: 'skin_pack' }] })).toBeNull();
		expect(addonTypeFromManifest({})).toBeNull();
	});

	it('installs an uploaded resource pack', async () => {
		const archive = await makeArchive({
			'manifest.json': manifest('11111111', [1, 0, 0], 'Fancy Textures', ['resources']),
			'texts/en_US.lang': 'pack.name=Fancy Textures'
		});

		const result = await installAddonArchive(slug, archive, 'fancy.mcpack');
		expect(result.skipped).toEqual([]);
		expect(result.installed).toHaveLength(1);

		const installed = await getInstalledAddons(slug);
		expect(installed.invalid).toEqual([]);
		expect(installed.addons).toHaveLength(1);
		expect(installed.addons[0]).toMatchObject({
			type: 'resource',
			folder: 'Fancy Textures',
			uuid: '11111111-header',
			name: 'Fancy Textures',
			version: [1, 0, 0],
			versionLabel: '1.0.0'
		});

		// Contents are copied, not just the manifest.
		const lang = await fs.readFile(
			path.join(addonDir(slug, 'resource'), 'Fancy Textures', 'texts/en_US.lang'),
			'utf8'
		);
		expect(lang).toContain('Fancy Textures');
	});

	it('installs every pack inside an mcaddon, nested or not', async () => {
		const archive = await makeArchive({
			'My Addon/manifest.json': manifest('22222222', [2, 1, 0], 'Zombie Behavior', ['data']),
			'My Addon/scripts/main.js': 'console.log(1)',
			'textures/manifest.json': manifest('33333333', [1, 2, 3], 'Zombie Textures', ['resources'])
		});

		const result = await installAddonArchive(slug, archive, 'zombies.mcaddon');
		expect(result.skipped).toEqual([]);
		expect(result.installed.map((addon) => addon.type).sort()).toEqual(['behavior', 'resource']);

		const installed = await getInstalledAddons(slug);
		expect(installed.addons.map((addon) => addon.folder).sort()).toEqual([
			'Zombie Behavior',
			'Zombie Textures'
		]);
		expect(installed.addons.find((addon) => addon.type === 'behavior')?.hasScripts).toBe(false);
	});

	it('replaces an existing pack when the same uuid is uploaded again', async () => {
		await installAddonArchive(
			slug,
			await makeArchive({
				'manifest.json': manifest('44444444', [1, 0, 0], 'Fancy Textures', ['resources']),
				'old.txt': 'old'
			}),
			'fancy.mcpack'
		);
		await installAddonArchive(
			slug,
			await makeArchive({
				'manifest.json': manifest('44444444', [1, 1, 0], 'Fancy Textures', ['resources']),
				'new.txt': 'new'
			}),
			'fancy-2.mcpack'
		);

		const installed = await getInstalledAddons(slug);
		expect(installed.addons).toHaveLength(1);
		expect(installed.addons[0].versionLabel).toBe('1.1.0');

		const folder = path.join(addonDir(slug, 'resource'), 'Fancy Textures');
		expect(await fs.readFile(path.join(folder, 'new.txt'), 'utf8')).toBe('new');
		await expect(fs.readFile(path.join(folder, 'old.txt'), 'utf8')).rejects.toThrow();
	});

	it('rejects an archive without a manifest and reports unusable packs', async () => {
		await expect(
			installAddonArchive(slug, await makeArchive({ 'readme.txt': 'not a pack' }), 'nope.mcpack')
		).rejects.toThrow(/no manifest.json/);

		const result = await installAddonArchive(
			slug,
			await makeArchive({
				'skin/manifest.json': manifest('55555555', [1, 0, 0], 'Skin Pack', ['skin_pack'])
			}),
			'skin.mcpack'
		);
		expect(result.installed).toEqual([]);
		expect(result.skipped).toEqual([
			{ name: 'Skin Pack', reason: 'pack has no resources or data modules' }
		]);
	});

	it('reports folders that are not usable packs and deletes them', async () => {
		await fs.mkdir(path.join(addonDir(slug, 'behavior'), 'Broken Pack'), { recursive: true });

		const installed = await getInstalledAddons(slug);
		expect(installed.addons).toEqual([]);
		expect(installed.invalid).toEqual([
			{ type: 'behavior', folder: 'Broken Pack', reason: 'no manifest.json' }
		]);

		await removeAddon(slug, 'behavior', 'Broken Pack');
		expect(await getInstalledAddons(slug)).toEqual({ addons: [], invalid: [] });
	});

	it('refuses to delete outside the pack directories', async () => {
		await fs.mkdir(path.join(addonDir(slug, 'resource'), 'Real Pack'), { recursive: true });

		await expect(removeAddon(slug, 'resource', '../../..')).rejects.toThrow('Invalid addon folder');
		await expect(removeAddon(slug, 'resource', 'nested/pack')).rejects.toThrow(
			'Invalid addon folder'
		);
		expect(await fs.readdir(serverDir)).toContain('resource_packs');
	});

	it('reads and writes the per-world pack files', async () => {
		const worldId = 'My World';
		const worldDir = path.join(serverDir, 'worlds', worldId);
		await fs.mkdir(worldDir, { recursive: true });

		expect(await getWorldAddons(slug, worldId)).toEqual({ behavior: [], resource: [] });

		await setWorldAddons(slug, worldId, {
			behavior: [{ pack_id: '22222222-header', version: [2, 1, 0] }],
			resource: [{ pack_id: '11111111-header', version: [1, 0, 0] }]
		});

		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_behavior_packs.json'), 'utf8'))
		).toEqual([{ pack_id: '22222222-header', version: [2, 1, 0] }]);
		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_resource_packs.json'), 'utf8'))
		).toEqual([{ pack_id: '11111111-header', version: [1, 0, 0] }]);

		// Enabling nothing empties the files that already exist...
		await setWorldAddons(slug, worldId, { behavior: [], resource: [] });
		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_behavior_packs.json'), 'utf8'))
		).toEqual([]);

		// ...but does not create the files for a world that never had them.
		const freshWorld = path.join(serverDir, 'worlds', 'Fresh');
		await fs.mkdir(freshWorld, { recursive: true });
		await setWorldAddons(slug, 'Fresh', { behavior: [], resource: [] });
		expect(await fs.readdir(freshWorld)).toEqual([]);
	});

	it('keeps entries readable when a world file holds unexpected data', async () => {
		const worldId = 'Odd World';
		const worldDir = path.join(serverDir, 'worlds', worldId);
		await fs.mkdir(worldDir, { recursive: true });
		await fs.writeFile(
			path.join(worldDir, 'world_resource_packs.json'),
			JSON.stringify([{ pack_id: 'aaaa', version: [1, 0, 0] }, { pack_id: 42 }, 'nonsense']),
			'utf8'
		);

		expect(await getWorldAddons(slug, worldId)).toEqual({
			behavior: [],
			resource: [{ pack_id: 'aaaa', version: [1, 0, 0] }]
		});
	});
});

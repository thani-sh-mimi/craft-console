import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { ZipArchive } from 'archiver';
import { actions, load } from './routes/servers/[serverSlug]/worlds/[worldId]/+page.server';
import {
	actions as addonActions,
	load as addonsLoad
} from './routes/servers/[serverSlug]/addons/+page.server';

const slug = 'test-addon-routes';
const serverDir = path.join(process.cwd(), 'data', 'servers', slug);
const worldId = 'World One';
const worldDir = path.join(serverDir, 'worlds', worldId);

type LoadEvent = Parameters<typeof load>[0];
type AddonsLoadEvent = Parameters<typeof addonsLoad>[0];
type UploadEvent = Parameters<typeof addonActions.upload>[0];
type RemoveEvent = Parameters<typeof addonActions.remove>[0];
type SaveEvent = Parameters<typeof actions.save>[0];

/** Route handlers are called directly here, so a minimal event object is enough. */
function event<T>(params: Record<string, string>, request?: Request): T {
	return { params, request } as unknown as T;
}

function post(url: string, form: FormData): Request {
	return new Request(url, { method: 'POST', body: form });
}

async function makeArchive(files: Record<string, string>): Promise<ArrayBuffer> {
	const archive = new ZipArchive({ zlib: { level: 9 } });
	const output = new PassThrough();
	const chunks: Buffer[] = [];
	output.on('data', (chunk: Buffer) => chunks.push(chunk));
	const finished = new Promise<void>((resolve) => output.on('end', () => resolve()));

	archive.pipe(output);
	for (const [name, content] of Object.entries(files)) archive.append(content, { name });
	await archive.finalize();
	await finished;

	const buffer = Buffer.concat(chunks);
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength
	) as ArrayBuffer;
}

function packManifest(uuid: string, version: number[], name: string, moduleType: string) {
	return JSON.stringify({
		format_version: 2,
		header: { uuid, version, name },
		modules: [{ type: moduleType, uuid: `${uuid}-module`, version }]
	});
}

async function installAddon(uuid: string, version: number[], name: string, moduleType: string) {
	const type = moduleType === 'resources' ? 'resource_packs' : 'behavior_packs';
	const dir = path.join(serverDir, type, name);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, 'manifest.json'),
		packManifest(uuid, version, name, moduleType),
		'utf8'
	);
}

describe('Addons page route', () => {
	beforeEach(async () => {
		await fs.mkdir(serverDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {});
	});

	it('installs an uploaded pack and lists it', async () => {
		const form = new FormData();
		form.append(
			'addonFile',
			new File(
				[
					await makeArchive({
						'manifest.json': packManifest('a1', [1, 0, 0], 'Nice Packs', 'resources')
					})
				],
				'nice.mcpack'
			)
		);

		const result = (await addonActions.upload(
			event<UploadEvent>({ serverSlug: slug }, post('http://localhost/addons', form))
		)) as { success?: boolean; message?: string };

		expect(result.success).toBe(true);
		expect(result.message).toContain('Installed Nice Packs');

		const loaded = (await addonsLoad(event<AddonsLoadEvent>({ serverSlug: slug }))) as {
			addons: { name: string }[];
		};
		expect(loaded.addons.map((addon) => addon.name)).toEqual(['Nice Packs']);
	});

	it('rejects an upload that is not an addon archive', async () => {
		const form = new FormData();
		form.append('addonFile', new File(['just text'], 'notes.txt'));

		const result = (await addonActions.upload(
			event<UploadEvent>({ serverSlug: slug }, post('http://localhost/addons', form))
		)) as { status?: number; data?: { error: string } };

		expect(result.status).toBe(400);
		expect(result.data?.error).toContain('Unsupported file "notes.txt"');
	});

	it('requires a file to be selected', async () => {
		const result = (await addonActions.upload(
			event<UploadEvent>({ serverSlug: slug }, post('http://localhost/addons', new FormData()))
		)) as { status?: number; data?: { error: string } };

		expect(result.status).toBe(400);
		expect(result.data?.error).toBe('Please select an addon file to upload.');
	});

	it('rejects an oversized upload before reading the body', async () => {
		// Only headers are needed: the size guard runs before request.formData(),
		// so an oversized body is never buffered.
		const request = { headers: new Headers({ 'content-length': String(200 * 1024 * 1024) }) };

		const result = (await addonActions.upload(
			event<UploadEvent>({ serverSlug: slug }, request as unknown as Request)
		)) as { status?: number; data?: { error: string } };

		expect(result.status).toBe(413);
		expect(result.data?.error).toContain('larger than 128 MB');
	});

	it('deletes an installed pack', async () => {
		await installAddon('b1', [1, 0, 0], 'Old Behavior', 'data');

		const form = new FormData();
		form.append('type', 'behavior');
		form.append('folder', 'Old Behavior');

		const result = (await addonActions.remove(
			event<RemoveEvent>({ serverSlug: slug }, post('http://localhost/addons', form))
		)) as { success?: boolean; message?: string };

		expect(result.success).toBe(true);
		expect(result.message).toBe('Deleted "Old Behavior".');

		const loaded = (await addonsLoad(event<AddonsLoadEvent>({ serverSlug: slug }))) as {
			addons: unknown[];
		};
		expect(loaded.addons).toEqual([]);
	});

	it('reports deleting the other half of a combined pack', async () => {
		await installAddon('c2', [1, 0, 0], 'Combined Pack', 'resources');
		await installAddon('c2', [1, 0, 0], 'Combined Pack', 'data');

		const form = new FormData();
		form.append('type', 'behavior');
		form.append('folder', 'Combined Pack');

		const result = (await addonActions.remove(
			event<RemoveEvent>({ serverSlug: slug }, post('http://localhost/addons', form))
		)) as { success?: boolean; message?: string };

		expect(result.message).toBe('Deleted "Combined Pack" and its resource_packs copy.');

		const loaded = (await addonsLoad(event<AddonsLoadEvent>({ serverSlug: slug }))) as {
			addons: unknown[];
		};
		expect(loaded.addons).toEqual([]);
	});

	it('rejects a delete request without type and folder', async () => {
		const result = (await addonActions.remove(
			event<RemoveEvent>({ serverSlug: slug }, post('http://localhost/addons', new FormData()))
		)) as { status?: number; data?: { error: string } };

		expect(result.status).toBe(400);
		expect(result.data?.error).toBe('Missing addon type or folder.');
	});
});

describe('World addons route', () => {
	beforeEach(async () => {
		await fs.mkdir(worldDir, { recursive: true });
		await fs.writeFile(path.join(worldDir, 'levelname.txt'), 'My World\n', 'utf8');
		await installAddon('b1', [2, 0, 0], 'Addon Behavior', 'data');
		await installAddon('r1', [1, 3, 0], 'Addon Textures', 'resources');
	});

	afterEach(async () => {
		await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {});
	});

	it('loads the world, its installed addons and what is enabled', async () => {
		const loaded = (await load(event<LoadEvent>({ serverSlug: slug, worldId }))) as {
			world: { name: string };
			addons: { addons: unknown[] };
			enabled: { behavior: unknown[]; resource: unknown[] };
		};

		expect(loaded.world.name).toBe('My World');
		expect(loaded.addons.addons).toHaveLength(2);
		expect(loaded.enabled).toEqual({ behavior: [], resource: [] });
	});

	it('404s for a world that does not exist', async () => {
		await expect(
			load(event<LoadEvent>({ serverSlug: slug, worldId: 'Nope' }))
		).rejects.toMatchObject({ status: 404 });
	});

	it('writes the checked packs to the world pack files', async () => {
		const form = new FormData();
		form.append('enabled-behavior', 'b1');
		form.append('enabled-resource', 'r1');

		const result = (await actions.save(
			event<SaveEvent>({ serverSlug: slug, worldId }, post('http://localhost/worlds', form))
		)) as { success?: boolean; message?: string };

		expect(result.success).toBe(true);
		expect(result.message).toBe('Saved 2 addon(s).');

		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_behavior_packs.json'), 'utf8'))
		).toEqual([{ pack_id: 'b1', version: [2, 0, 0] }]);
		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_resource_packs.json'), 'utf8'))
		).toEqual([{ pack_id: 'r1', version: [1, 3, 0] }]);
	});

	it('removes packs again when nothing is checked', async () => {
		const form = new FormData();
		form.append('enabled-behavior', 'b1');
		await actions.save(
			event<SaveEvent>({ serverSlug: slug, worldId }, post('http://localhost/worlds', form))
		);

		const result = (await actions.save(
			event<SaveEvent>(
				{ serverSlug: slug, worldId },
				post('http://localhost/worlds', new FormData())
			)
		)) as { message?: string };

		expect(result.message).toBe('All addons disabled for this world.');
		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_behavior_packs.json'), 'utf8'))
		).toEqual([]);
	});

	it('keeps enabled entries whose pack is no longer installed', async () => {
		await fs.writeFile(
			path.join(worldDir, 'world_resource_packs.json'),
			JSON.stringify([{ pack_id: 'gone', version: [1, 0, 0] }]),
			'utf8'
		);

		const form = new FormData();
		form.append('enabled-behavior', 'b1');

		await actions.save(
			event<SaveEvent>({ serverSlug: slug, worldId }, post('http://localhost/worlds', form))
		);

		expect(
			JSON.parse(await fs.readFile(path.join(worldDir, 'world_resource_packs.json'), 'utf8'))
		).toEqual([{ pack_id: 'gone', version: [1, 0, 0] }]);
	});

	it('refuses to save for a world outside the worlds directory', async () => {
		await expect(
			actions.save(
				event<SaveEvent>(
					{ serverSlug: slug, worldId: '../../..' },
					post('http://localhost/worlds', new FormData())
				)
			)
		).rejects.toMatchObject({ status: 404 });
	});
});

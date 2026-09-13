import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import path from 'path';
import { promises as fs } from 'fs';
import {
	addonTypes,
	getInstalledAddons,
	getWorldAddons,
	setWorldAddons,
	type AddonType,
	type WorldAddons
} from '$lib/server/addons';

function resolveWorldDir(slug: string, worldId: string): string {
	const worldsDir = path.join(process.cwd(), 'data', 'servers', slug, 'worlds');
	const dir = path.resolve(path.join(worldsDir, worldId));

	if (path.dirname(dir) !== path.resolve(worldsDir)) {
		throw error(404, 'World not found');
	}

	return dir;
}

async function readWorldName(worldDir: string, fallback: string): Promise<string> {
	try {
		const name = (await fs.readFile(path.join(worldDir, 'levelname.txt'), 'utf8')).trim();
		return name || fallback;
	} catch {
		return fallback;
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const { serverSlug, worldId } = params;
	const worldDir = resolveWorldDir(serverSlug, worldId);

	const stat = await fs.stat(worldDir).catch(() => null);
	if (!stat?.isDirectory()) {
		throw error(404, 'World not found');
	}

	const [addons, enabled, name] = await Promise.all([
		getInstalledAddons(serverSlug),
		getWorldAddons(serverSlug, worldId),
		readWorldName(worldDir, worldId)
	]);

	return {
		world: { id: worldId, name },
		addons,
		enabled
	};
};

export const actions = {
	save: async ({ params, request }) => {
		const { serverSlug, worldId } = params;
		const worldDir = resolveWorldDir(serverSlug, worldId);

		const stat = await fs.stat(worldDir).catch(() => null);
		if (!stat?.isDirectory()) {
			return fail(404, { error: 'World not found.' });
		}

		const form = await request.formData();
		const [installed, current] = await Promise.all([
			getInstalledAddons(serverSlug),
			getWorldAddons(serverSlug, worldId)
		]);

		const next: WorldAddons = { behavior: [], resource: [] };

		for (const type of addonTypes as AddonType[]) {
			const selected = new Set(form.getAll(`enabled-${type}`).map(String));
			const installedUuids = new Set(
				installed.addons.filter((addon) => addon.type === type).map((addon) => addon.uuid)
			);

			for (const addon of installed.addons) {
				if (addon.type === type && selected.has(addon.uuid)) {
					next[type].push({ pack_id: addon.uuid, version: addon.version });
				}
			}

			// Entries that are enabled but no longer installed are kept, so saving does
			// not silently drop a pack the world still points at.
			for (const entry of current[type]) {
				if (!installedUuids.has(entry.pack_id)) {
					next[type].push(entry);
				}
			}
		}

		try {
			await setWorldAddons(serverSlug, worldId, next);
		} catch (err) {
			console.error(`Failed to save addons for world "${worldId}":`, err);
			return fail(400, {
				error: err instanceof Error ? err.message : 'Failed to save the addon configuration.'
			});
		}

		const total = next.behavior.length + next.resource.length;
		return {
			success: true,
			message: total === 0 ? 'All addons disabled for this world.' : `Saved ${total} addon(s).`
		};
	}
} satisfies Actions;

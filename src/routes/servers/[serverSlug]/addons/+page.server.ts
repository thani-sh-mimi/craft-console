import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
	addonDirectories,
	getInstalledAddons,
	installAddonArchive,
	removeAddon,
	type AddonType
} from '$lib/server/addons';

const addonExtensions = ['.mcpack', '.mcaddon', '.zip'];
const maxAddonSize = 128 * 1024 * 1024;
/** Multipart bodies carry boundaries and a header per part, so allow some slack. */
const maxAddonRequestSize = maxAddonSize + 1024 * 1024;

export const load: PageServerLoad = async ({ params }) => {
	return await getInstalledAddons(params.serverSlug);
};

export const actions = {
	upload: async ({ params, request }) => {
		// Reject an oversized body before buffering it: request.formData() reads the
		// whole multipart body into memory, so a size check applied afterwards still
		// pays for the memory (and blocks the event loop) first.
		const declaredSize = Number(request.headers.get('content-length') ?? '');
		if (Number.isFinite(declaredSize) && declaredSize > maxAddonRequestSize) {
			return fail(413, {
				error: `Upload is larger than ${maxAddonSize / (1024 * 1024)} MB.`
			});
		}

		const form = await request.formData();
		const file = form.get('addonFile') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Please select an addon file to upload.' });
		}

		if (!addonExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
			return fail(400, {
				error: `Unsupported file "${file.name}". Upload a .mcpack, .mcaddon or .zip file.`
			});
		}

		if (file.size > maxAddonSize) {
			return fail(413, {
				error: `"${file.name}" is larger than ${maxAddonSize / (1024 * 1024)} MB.`
			});
		}

		try {
			const result = await installAddonArchive(
				params.serverSlug,
				Buffer.from(await file.arrayBuffer()),
				file.name
			);

			// A combined pack is installed once per pack directory, so report it once.
			const installed = [...new Set(result.installed.map((addon) => addon.name))].join(', ');
			const skipped = result.skipped.map((pack) => `${pack.name} (${pack.reason})`).join(', ');

			return {
				success: true,
				message: [
					installed ? `Installed ${installed}.` : 'No packs were installed.',
					skipped ? `Skipped ${skipped}.` : ''
				]
					.filter(Boolean)
					.join(' ')
			};
		} catch (err) {
			console.error(`Failed to install addon "${file.name}":`, err);
			return fail(400, {
				error: err instanceof Error ? err.message : 'Failed to install the uploaded addon.'
			});
		}
	},

	remove: async ({ params, request }) => {
		const form = await request.formData();
		const type = form.get('type')?.toString() as AddonType | undefined;
		const folder = form.get('folder')?.toString();

		if (!type || !folder) {
			return fail(400, { error: 'Missing addon type or folder.' });
		}

		try {
			const result = await removeAddon(params.serverSlug, type, folder);
			const elsewhere = result.removed.filter((entry) => entry.type !== type);

			return {
				success: true,
				message:
					elsewhere.length > 0
						? `Deleted "${folder}" and its ${elsewhere
								.map((entry) => addonDirectories[entry.type])
								.join(', ')} copy.`
						: `Deleted "${folder}".`
			};
		} catch (err) {
			console.error(`Failed to delete addon "${folder}":`, err);
			return fail(400, {
				error: err instanceof Error ? err.message : 'Failed to delete the addon.'
			});
		}
	}
} satisfies Actions;

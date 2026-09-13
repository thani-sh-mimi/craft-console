import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
	getInstalledAddons,
	installAddonArchive,
	removeAddon,
	type AddonType
} from '$lib/server/addons';

const addonExtensions = ['.mcpack', '.mcaddon', '.zip'];
const maxAddonSize = 128 * 1024 * 1024;

export const load: PageServerLoad = async ({ params }) => {
	return await getInstalledAddons(params.serverSlug);
};

export const actions = {
	upload: async ({ params, request }) => {
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
			return fail(400, {
				error: `"${file.name}" is larger than ${maxAddonSize / (1024 * 1024)} MB.`
			});
		}

		try {
			const result = await installAddonArchive(
				params.serverSlug,
				Buffer.from(await file.arrayBuffer()),
				file.name
			);

			const installed = result.installed.map((addon) => addon.name).join(', ');
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
			await removeAddon(params.serverSlug, type, folder);
			return { success: true, message: `Deleted "${folder}".` };
		} catch (err) {
			console.error(`Failed to delete addon "${folder}":`, err);
			return fail(400, {
				error: err instanceof Error ? err.message : 'Failed to delete the addon.'
			});
		}
	}
} satisfies Actions;

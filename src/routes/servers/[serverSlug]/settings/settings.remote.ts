import { z } from 'zod';
import { command } from '$app/server';
import { setServerConfig } from '$lib/server/minecraft';
import { partialMinecraftConfigSchema } from '$lib/types/MinecraftServerConfig';

/**
 * Schema for the updateServerConfig command argument.
 * Accepts the server slug and a partial config with only the changed fields.
 */
const updateSchema = z.object({
	slug: z.string(),
	changes: partialMinecraftConfigSchema
});

/**
 * Remote command to update a server's configuration.
 * Only the provided fields in `changes` are written — missing fields are left untouched.
 */
export const updateServerConfig = command(updateSchema, async ({ slug, changes }) => {
	await setServerConfig(slug, changes);
});

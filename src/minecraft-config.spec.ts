import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { setServerConfig } from './lib/server/minecraft';
import { partialMinecraftConfigSchema } from './lib/types/MinecraftServerConfig';

const slug = 'test-server-config';
const serverDir = path.join(process.cwd(), 'data', 'servers', slug);
const propsPath = path.join(serverDir, 'server.properties');

// Deliberately non-default values, so that a reset to schema defaults is detectable.
const properties = [
	'server-name=Thanish Land',
	'gamemode=creative',
	'difficulty=hard',
	'max-players=7',
	'online-mode=false',
	'view-distance=10'
].join('\n');

describe('Server config updates', () => {
	beforeEach(async () => {
		await fs.mkdir(serverDir, { recursive: true });
		await fs.writeFile(propsPath, properties, 'utf8');
	});

	afterEach(async () => {
		await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {});
	});

	it('writes only the field that was changed', async () => {
		// Mirrors the updateServerConfig remote command: validate the client's changes
		// with the partial config schema, then merge them into server.properties.
		const changes = partialMinecraftConfigSchema.parse({ 'max-players': 25 });
		expect(Object.keys(changes)).toEqual(['max-players']);

		await setServerConfig(slug, changes);

		const saved = await fs.readFile(propsPath, 'utf8');

		expect(saved).toContain('max-players=25');
		expect(saved).toContain('server-name=Thanish Land');
		expect(saved).toContain('gamemode=creative');
		expect(saved).toContain('difficulty=hard');
		expect(saved).toContain('online-mode=false');
		expect(saved).toContain('view-distance=10');
	});

	it('coerces values the form sends as strings', async () => {
		const changes = partialMinecraftConfigSchema.parse({
			'max-players': '30',
			'online-mode': 'false',
			gamemode: 'adventure'
		});

		expect(changes).toEqual({ 'max-players': 30, 'online-mode': false, gamemode: 'adventure' });

		await setServerConfig(slug, changes);

		const saved = await fs.readFile(propsPath, 'utf8');
		expect(saved).toContain('max-players=30');
		expect(saved).toContain('online-mode=false');
		expect(saved).toContain('gamemode=adventure');
		expect(saved).toContain('server-name=Thanish Land');
		expect(saved).toContain('difficulty=hard');
	});
});

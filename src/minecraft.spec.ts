import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getServerVersionInfo, getLatestVersionInfo } from './lib/server/minecraft';

describe('Minecraft Server Version Tests', () => {
	const slug = 'test-server-temp';
	const serverDir = path.join(process.cwd(), 'data', 'servers', slug);

	beforeEach(async () => {
		await fs.mkdir(serverDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {});
	});

	it('should return default version when version.json is missing', async () => {
		const info = await getServerVersionInfo(slug);
		expect(info).toEqual({
			version: '1.0.0',
			downloadType: 'serverBedrockLinux'
		});
	});

	it('should return version from version.json when present', async () => {
		const testInfo = {
			version: '1.20.10.02',
			downloadType: 'serverBedrockLinux',
			downloadUrl: 'https://minecraft.net/download/1.20.10.02.zip'
		};
		await fs.writeFile(
			path.join(serverDir, 'version.json'),
			JSON.stringify(testInfo, null, 2),
			'utf8'
		);

		const info = await getServerVersionInfo(slug);
		expect(info).toEqual({
			version: '1.20.10.02',
			downloadType: 'serverBedrockLinux',
			downloadUrl: 'https://minecraft.net/download/1.20.10.02.zip'
		});
	});

	it('should fetch latest version info', async () => {
		const mockResponse = {
			result: {
				links: [
					{
						downloadType: 'serverBedrockLinux',
						downloadUrl:
							'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links/bedrock-server-1.21.2.02.zip'
					}
				]
			}
		};

		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			} as Response)
		);

		const latestInfo = await getLatestVersionInfo('serverBedrockLinux');
		expect(latestInfo).toEqual({
			version: '1.21.2.02',
			downloadUrl:
				'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links/bedrock-server-1.21.2.02.zip'
		});

		global.fetch = originalFetch;
	});
});

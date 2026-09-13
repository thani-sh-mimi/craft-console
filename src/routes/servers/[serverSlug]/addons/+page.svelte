<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Heading, Input, Text } from '$lib/client/ui';
	import { Boxes, Code, Trash2, Upload } from 'lucide-svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const behaviorPacks = $derived(data.addons.filter((addon) => addon.type === 'behavior'));
	const resourcePacks = $derived(data.addons.filter((addon) => addon.type === 'resource'));

	function formatUuid(uuid: string) {
		return uuid.length > 20 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid;
	}
</script>

<div class="flex w-full flex-col gap-8">
	<Heading>Addons</Heading>

	{#if data.server.status === 'running'}
		<p class="border-4 border-yellow-500 bg-yellow-900/50 px-4 py-3 text-xl text-yellow-300">
			Warning: The server is currently running. Packs are loaded when the server starts, so restart
			it for changes to take effect.
		</p>
	{/if}

	<!-- Upload form -->
	<div class="border-4 border-zinc-700 bg-zinc-800 p-6">
		<Text className="text-white font-bold mb-4 text-lg">Upload Addon</Text>
		<Text className="text-zinc-400 mb-6 text-sm">
			Upload a .mcpack (single pack) or .mcaddon (pack bundle) file. Packs are unpacked into the
			server's behavior_packs and resource_packs folders; uploading a pack that is already installed
			replaces it with the new version.
		</Text>

		{#if form?.error}
			<div class="mb-4 border-4 border-red-600 bg-red-900 px-4 py-2 text-sm text-white">
				{form.error}
			</div>
		{/if}

		{#if form?.message}
			<div class="mb-4 border-4 border-green-600 bg-green-900 px-4 py-2 text-sm text-white">
				{form.message}
			</div>
		{/if}

		<form
			method="post"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
				};
			}}
			class="flex flex-col gap-6"
		>
			<Input
				id="addonFile"
				label="Addon file:"
				type="file"
				accept=".mcpack,.mcaddon,.zip"
				required
			/>
			<div>
				<Button type="submit" icon={Upload}>Upload</Button>
			</div>
		</form>
	</div>

	<!-- Installed addons -->
	{#each [{ type: 'behavior', label: 'Behavior Packs', packs: behaviorPacks }, { type: 'resource', label: 'Resource Packs', packs: resourcePacks }] as section (section.type)}
		<div class="flex flex-col gap-0 border-4 border-zinc-700">
			<div class="flex items-center gap-3 bg-zinc-800 px-6 py-4">
				<Boxes class="h-6 w-6 text-zinc-400" />
				<Text className="text-white font-bold mb-0">
					{section.label} ({section.packs.length})
				</Text>
			</div>

			{#if section.packs.length === 0}
				<div class="bg-zinc-900 p-8 text-center">
					<Text>No {section.label.toLowerCase()} installed.</Text>
					<Text className="text-zinc-400 mt-2 text-sm">
						Upload a .mcpack or .mcaddon file above to install one.
					</Text>
				</div>
			{:else}
				{#each section.packs as addon, i (addon.uuid)}
					<div
						class="flex items-center justify-between gap-4 px-6 py-4 {i % 2 === 0
							? 'bg-zinc-800'
							: 'bg-zinc-900'}"
					>
						<div class="flex min-w-0 flex-col">
							<div class="flex flex-wrap items-center gap-3">
								<span class="truncate font-bold text-white" title={addon.name}>{addon.name}</span>
								<span
									class="border-2 border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300"
								>
									v{addon.versionLabel}
								</span>
								{#if addon.hasScripts}
									<span
										class="flex items-center gap-1 border-2 border-blue-600 bg-blue-900 px-2 py-0.5 text-xs text-blue-200"
									>
										<Code class="h-3 w-3" />
										Scripts
									</span>
								{/if}
							</div>
							{#if addon.description}
								<span class="mt-1 text-xs text-zinc-400">{addon.description}</span>
							{/if}
							<span class="text-xs text-zinc-500" title={addon.uuid}>
								{formatUuid(addon.uuid)} · {addon.folder}
							</span>
						</div>

						<form method="post" action="?/remove" use:enhance>
							<input type="hidden" name="type" value={addon.type} />
							<input type="hidden" name="folder" value={addon.folder} />
							<Button
								type="submit"
								icon={Trash2}
								className="!bg-red-900 hover:!bg-red-700 border-red-800 text-white !text-sm !px-4 !py-2"
							></Button>
						</form>
					</div>
				{/each}
			{/if}
		</div>
	{/each}

	<!-- Folders that cannot be read as packs -->
	{#if data.invalid.length > 0}
		<div class="flex flex-col gap-0 border-4 border-red-800">
			<div class="bg-red-900/50 px-6 py-4">
				<Text className="text-white font-bold mb-0">
					Unusable folders ({data.invalid.length})
				</Text>
				<Text className="text-red-200 mt-2 text-sm mb-0">
					These folders are in the pack directories but do not contain a readable manifest.json, so
					the server will ignore them. Delete the ones you no longer need.
				</Text>
			</div>

			{#each data.invalid as entry, i (entry.type + entry.folder)}
				<div
					class="flex items-center justify-between gap-4 px-6 py-4 {i % 2 === 0
						? 'bg-zinc-800'
						: 'bg-zinc-900'}"
				>
					<div class="flex min-w-0 flex-col">
						<span class="truncate font-bold text-white" title={entry.folder}>{entry.folder}</span>
						<span class="text-xs text-zinc-400"
							>{entry.reason} · {entry.type === 'behavior'
								? 'behavior_packs'
								: 'resource_packs'}</span
						>
					</div>

					<form method="post" action="?/remove" use:enhance>
						<input type="hidden" name="type" value={entry.type} />
						<input type="hidden" name="folder" value={entry.folder} />
						<Button
							type="submit"
							icon={Trash2}
							className="!bg-red-900 hover:!bg-red-700 border-red-800 text-white !text-sm !px-4 !py-2"
						></Button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>

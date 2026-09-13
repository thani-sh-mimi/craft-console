<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Heading, Text } from '$lib/client/ui';
	import { AlertTriangle, Save } from 'lucide-svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const behaviorPacks = $derived(data.addons.addons.filter((addon) => addon.type === 'behavior'));
	const resourcePacks = $derived(data.addons.addons.filter((addon) => addon.type === 'resource'));

	const enabled = $derived({
		behavior: new Set(data.enabled.behavior.map((entry) => entry.pack_id)),
		resource: new Set(data.enabled.resource.map((entry) => entry.pack_id))
	});

	/** Enabled for this world but no longer installed on the server. */
	const missing = $derived({
		behavior: data.enabled.behavior.filter(
			(entry) => !behaviorPacks.some((addon) => addon.uuid === entry.pack_id)
		),
		resource: data.enabled.resource.filter(
			(entry) => !resourcePacks.some((addon) => addon.uuid === entry.pack_id)
		)
	});

	const sections = $derived([
		{ type: 'behavior' as const, label: 'Behavior Packs', packs: behaviorPacks },
		{ type: 'resource' as const, label: 'Resource Packs', packs: resourcePacks }
	]);

	function formatUuid(uuid: string) {
		return uuid.length > 20 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid;
	}
</script>

<div class="flex w-full flex-col gap-8">
	<Heading>Addons for {data.world.name}</Heading>
	<Text className="text-zinc-400 -mt-4 text-sm">
		Enabled packs are written to <code>world_behavior_packs.json</code> and
		<code>world_resource_packs.json</code> in this world's folder.
	</Text>

	{#if data.server.status === 'running'}
		<p class="border-4 border-yellow-500 bg-yellow-900/50 px-4 py-3 text-xl text-yellow-300">
			Warning: The server is currently running. Restart it for addon changes to take effect.
		</p>
	{/if}

	{#if form?.error}
		<div class="border-4 border-red-600 bg-red-900 px-4 py-2 text-sm text-white">{form.error}</div>
	{/if}

	{#if form?.message}
		<div class="border-4 border-green-600 bg-green-900 px-4 py-2 text-sm text-white">
			{form.message}
		</div>
	{/if}

	<form
		method="post"
		action="?/save"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
			};
		}}
		class="flex flex-col gap-8"
	>
		{#each sections as section (section.type)}
			<div class="flex flex-col gap-0 border-4 border-zinc-700">
				<div class="flex items-center justify-between gap-4 bg-zinc-800 px-6 py-4">
					<Text className="text-white font-bold mb-0">
						{section.label} ({section.packs.length})
					</Text>
					<Text className="text-zinc-400 text-sm mb-0">
						{enabled[section.type].size} enabled for this world
					</Text>
				</div>

				{#if section.packs.length === 0}
					<div class="bg-zinc-900 p-8 text-center">
						<Text>No {section.label.toLowerCase()} installed on this server.</Text>
						<Text className="text-zinc-400 mt-2 mb-0 text-sm">
							Install addons under Addons in the server navigation first.
						</Text>
					</div>
				{:else}
					{#each section.packs as addon, i (addon.uuid)}
						<label
							class="flex cursor-pointer items-center gap-4 px-6 py-4 {i % 2 === 0
								? 'bg-zinc-800'
								: 'bg-zinc-900'}"
						>
							<input
								type="checkbox"
								name="enabled-{section.type}"
								value={addon.uuid}
								checked={enabled[section.type].has(addon.uuid)}
								class="h-5 w-5 shrink-0 accent-green-500"
							/>
							<div class="flex min-w-0 flex-col">
								<div class="flex flex-wrap items-center gap-3">
									<span class="truncate font-bold text-white" title={addon.name}>{addon.name}</span>
									<span
										class="border-2 border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300"
									>
										v{addon.versionLabel}
									</span>
								</div>
								<span class="text-xs text-zinc-500" title={addon.uuid}>
									{formatUuid(addon.uuid)} · {addon.folder}
								</span>
							</div>
						</label>
					{/each}
				{/if}
			</div>
		{/each}

		{#if missing.behavior.length > 0 || missing.resource.length > 0}
			<div class="flex flex-col gap-2 border-4 border-yellow-600 bg-yellow-900/30 p-6">
				<div class="flex items-center gap-3">
					<AlertTriangle class="h-5 w-5 text-yellow-400" />
					<Text className="text-yellow-200 font-bold mb-0">
						{missing.behavior.length + missing.resource.length} enabled pack(s) are not installed
					</Text>
				</div>
				<Text className="text-yellow-100 text-sm mb-0">
					These entries stay in the world files until the packs are installed again, or the packs
					are deleted from the server.
				</Text>
				{#each [...missing.behavior, ...missing.resource] as entry (entry.pack_id)}
					<span class="text-xs text-yellow-100"
						>{formatUuid(entry.pack_id)} v{entry.version.join('.')}</span
					>
				{/each}
			</div>
		{/if}

		<div class="flex flex-row gap-6">
			<Button type="submit" icon={Save}>Save Addons</Button>
			<Button
				onclick={() => goto(resolve(`/servers/${data.server.slug}/worlds`))}
				className="!bg-zinc-700 hover:!bg-zinc-600 border-zinc-800"
			>
				Back to Worlds
			</Button>
		</div>
	</form>
</div>

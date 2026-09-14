<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Button, Heading, Input, Text } from '$lib/client/ui';
	import { Play, Square, RefreshCw, Download, ArrowUpCircle, Loader2 } from 'lucide-svelte';
	import type { PageProps } from './$types';
	import { getLogs } from './logs.remote';

	let { data, form }: PageProps = $props();

	let isUpdating = $state(false);

	type ProcessLogLine = {
		type: 'stdout' | 'stderr';
		line: string;
		time: number;
	};

	let logs: ProcessLogLine[] = $state([]);
	let logsInterval: ReturnType<typeof setInterval>;
	let consoleContainer: HTMLDivElement;
	let slug = $derived(page.url.pathname.split('/')[2]);

	let commandInput = $state('');

	const fetchLogs = async () => {
		if (!slug) return;
		try {
			const newLogs = await getLogs(slug).run();
			if (newLogs && newLogs.length !== logs.length) {
				logs = newLogs;
				requestAnimationFrame(() => {
					if (consoleContainer) {
						consoleContainer.scrollTop = consoleContainer.scrollHeight;
					}
				});
			}
		} catch (err) {
			console.error('Failed to fetch logs:', err);
		}
	};

	onMount(() => {
		logsInterval = setInterval(fetchLogs, 5000);
	});

	onDestroy(() => {
		if (logsInterval) {
			clearInterval(logsInterval);
		}
	});
</script>

<div class="mb-32 flex w-full flex-col gap-8">
	<!-- Console Engine section -->
	<div class="flex h-[550px] w-full flex-col gap-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div class="text-xl font-bold text-white">Server Engine</div>
				<div class="rounded bg-zinc-800 px-2 py-1 text-sm font-medium text-zinc-300 uppercase">
					Status: <span class={data.server.status === 'running' ? 'text-green-400' : 'text-red-400'}
						>{data.server.status}</span
					>
				</div>
			</div>

			<div class="flex gap-2">
				<Button onclick={fetchLogs} icon={RefreshCw} className="bg-zinc-700 hover:bg-zinc-600" />
				{#if data.server.status !== 'running'}
					<form method="post" action="?/start" use:enhance>
						<Button type="submit" icon={Play} className="bg-green-600 hover:bg-green-500" />
					</form>
				{:else}
					<form method="post" action="?/stop" use:enhance>
						<Button type="submit" icon={Square} className="bg-red-600 hover:bg-red-500" />
					</form>
				{/if}
			</div>
		</div>

		<div
			class="relative flex w-full flex-1 flex-col overflow-hidden rounded bg-zinc-950 p-4 font-mono text-sm text-white shadow-inner"
		>
			<div class="absolute top-2 right-4 text-xs text-zinc-500">Console</div>
			<div
				bind:this={consoleContainer}
				class="mt-4 flex flex-1 flex-col overflow-y-auto pb-2 break-all"
			>
				{#if logs.length === 0}
					<div class="text-zinc-600 italic">No logs available. Start the server to see output.</div>
				{:else}
					{#each logs as log, i (log.time + '-' + i)}
						<div
							class="flex flex-row py-0.5 whitespace-pre-wrap {log.type === 'stderr'
								? 'text-red-400'
								: ''}"
						>
							<span>{log.line}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<form
			method="post"
			action="?/input"
			use:enhance={() => {
				commandInput = '';
				return async ({ update }) => {
					await update({ reset: false });
				};
			}}
			class="flex w-full flex-row gap-2"
		>
			<div class="w-full flex-1">
				<Input
					id="command"
					value={commandInput}
					onchange={(v) => (commandInput = v as string)}
					placeholder="Enter server command (e.g. op username)"
				/>
			</div>
			<Button type="submit">Send</Button>
		</form>
	</div>

	<hr class="border-2 border-zinc-700" />

	<!-- Backup Server Section -->
	<div class="flex flex-col gap-4 border-4 border-zinc-700 bg-zinc-800 p-6">
		<Heading className="text-2xl">Server Backup</Heading>
		<Text>
			Download a full backup of this server's directory (including worlds, configurations, and
			scripts) as a ZIP archive.
		</Text>

		{#if data.server.status === 'running'}
			<p class="border-4 border-yellow-500 bg-yellow-900/50 px-4 py-3 text-xl text-yellow-300">
				Warning: The server is currently running. Taking a backup now may result in incomplete world
				data. We recommend stopping the server first.
			</p>
		{/if}

		<div>
			<Button
				onclick={() => {
					window.location.href = `/servers/${data.server.slug}/backup`;
				}}
				icon={Download}
			>
				Download
			</Button>
		</div>
	</div>

	<hr class="border-2 border-zinc-700" />

	<!-- Update Server Section -->
	<div class="flex flex-col gap-4 border-4 border-zinc-700 bg-zinc-800 p-6">
		<Heading className="text-2xl">Server Update</Heading>

		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
			<div class="flex flex-col gap-1">
				<Text>
					Current Version: <span class="font-mono font-bold text-white">{data.server.version}</span>
				</Text>
				<Text>
					Latest Version: <span class="font-mono font-bold text-white"
						>{data.server.latestVersion}</span
					>
				</Text>
			</div>

			<div class="flex items-center gap-2">
				{#if data.server.updateAvailable}
					<span
						class="rounded border border-yellow-500/30 bg-yellow-500/20 px-3 py-1.5 text-sm font-bold text-yellow-300"
					>
						Update available
					</span>
				{:else}
					<span
						class="rounded border border-green-500/30 bg-green-500/20 px-3 py-1.5 text-sm font-bold text-green-300"
					>
						Already on latest
					</span>
				{/if}
			</div>
		</div>

		{#if form?.error}
			<p class="border-4 border-red-500 bg-red-900/50 px-4 py-3 text-lg text-red-300">
				{form.error}
			</p>
		{/if}

		{#if data.server.updateAvailable}
			{#if data.server.status === 'running'}
				<p class="border-4 border-yellow-500 bg-yellow-900/50 px-4 py-3 text-lg text-yellow-300">
					Warning: The server is currently running. Please stop the server before installing
					updates.
				</p>
			{/if}

			<div>
				<form
					method="post"
					action="?/update"
					use:enhance={() => {
						isUpdating = true;
						return async ({ update }) => {
							await update();
							isUpdating = false;
						};
					}}
				>
					<Button
						type="submit"
						disabled={isUpdating || data.server.status === 'running'}
						icon={isUpdating ? Loader2 : ArrowUpCircle}
						className={isUpdating ? 'animate-pulse' : ''}
					>
						{isUpdating ? 'Updating...' : 'Update Server'}
					</Button>
				</form>
			</div>
		{/if}
	</div>
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, HTabs } from '$lib/client/ui';
	import { Boxes, LogOut } from 'lucide-svelte';
	import type { LayoutProps } from './$types';
	import consoleImage from './(assets)/console.png';
	import playerImage from './(assets)/player.png';
	import serverImage from './(assets)/server.png';
	import worldImage from './(assets)/world.png';

	let { data, children }: LayoutProps = $props();

	const base = `/servers/${data.server.slug}`;
	const tabs = [
		{ id: 'worlds', label: 'Worlds', href: `${base}/worlds`, imageSrc: worldImage },
		{ id: 'players', label: 'Players', href: `${base}/players`, imageSrc: playerImage },
		{ id: 'addons', label: 'Addons', href: `${base}/addons`, icon: Boxes },
		{ id: 'console', label: 'Console', href: `${base}/console`, imageSrc: consoleImage },
		{ id: 'settings', label: 'Settings', href: `${base}/settings`, imageSrc: serverImage }
	].map((tab) => ({
		...tab,
		onclick: () => goto(tab.href)
	}));

	const selectedTab = $derived(tabs.find((tab) => tab.href === page.url.pathname) ?? undefined);
</script>

<div class="flex h-screen w-full flex-col p-8">
	<header class="flex flex-row">
		<HTabs {tabs} selected={selectedTab?.id} />

		<form method="post" action="/auth?/logout" use:enhance class="ml-8 hidden sm:flex">
			<Button type="submit" icon={LogOut} className="py-5"></Button>
		</form>
	</header>

	<section class="mt-16">
		{@render children()}
	</section>
</div>

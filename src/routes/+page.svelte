<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createUploadThing } from '#lib/util/uploadthings.ts';

	const MAX_FILE_SIZE = 4 * 1024 * 1024;
	const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
	const { startUpload } = createUploadThing('imageUploader', {});

	type ProcessingResult = {
		original: { key: string; url: string };
		processed: { key: string; url: string };
	};

	let selectedFile = $state<File | null>(null);
	let uploadedOriginal = $state<{ fileKey: string; fileUrl: string } | null>(null);
	let previewUrl = $state<string | null>(null);
	let result = $state<ProcessingResult | null>(null);
	let isProcessing = $state(false);
	let statusMessage = $state('Choose an image to get started.');
	let errorMessage = $state<string | null>(null);

	function resetResults() {
		result = null;
		errorMessage = null;
		uploadedOriginal = null;
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];

		resetResults();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		selectedFile = null;

		if (!file) {
			statusMessage = 'Choose an image to get started.';
			return;
		}

		if (!ACCEPTED_TYPES.has(file.type)) {
			errorMessage = 'Choose a JPEG, PNG, or WebP image.';
			statusMessage = 'The selected file is not supported.';
			input.value = '';
			return;
		}

		if (file.size > MAX_FILE_SIZE) {
			errorMessage = 'The image must be 4 MB or smaller.';
			statusMessage = 'The selected image is too large.';
			input.value = '';
			return;
		}

		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
		statusMessage = 'Image ready to upload.';
	}

	async function processImage() {
		if (!selectedFile || isProcessing) return;

		isProcessing = true;
		result = null;
		errorMessage = null;

		try {
			if (!uploadedOriginal) {
				statusMessage = 'Uploading original image…';
				const uploadedFiles = await startUpload([selectedFile]);
				const uploadedFile = uploadedFiles?.[0];

				if (!uploadedFile) {
					throw new Error('The original image could not be uploaded.');
				}

				const fileKey = uploadedFile.key;
				const fileUrl = uploadedFile.ufsUrl;
				if (!fileKey || !fileUrl) {
					throw new Error('Upload completed, but its file details were not returned.');
				}
				uploadedOriginal = { fileKey, fileUrl };
			}

			statusMessage = 'Removing the background…';
			const response = await fetch('/api/process', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(uploadedOriginal)
			});

			const payload: ProcessingResult | { error?: string } = await response.json();
			if (!response.ok) {
				throw new Error(
					'error' in payload && payload.error ? payload.error : 'Image processing failed.'
				);
			}

			if (!('original' in payload) || !('processed' in payload)) {
				throw new Error('The server returned an invalid processing result.');
			}

			result = payload;
			statusMessage = 'Background removal complete.';
		} catch (error) {
			console.error('Background removal failed:', error);
			errorMessage =
				error instanceof Error ? error.message : 'Something went wrong. Please try again.';
			statusMessage = 'Could not finish processing.';
		} finally {
			isProcessing = false;
		}
	}

	function clearSelection() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		selectedFile = null;
		uploadedOriginal = null;
		result = null;
		errorMessage = null;
		statusMessage = 'Choose an image to get started.';
	}

	onDestroy(() => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<svelte:head>
	<title>Background Remover</title>
	<meta name="description" content="Upload one image and remove its background." />
</svelte:head>

<main class="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 sm:px-6">
	<div class="mx-auto max-w-4xl">
		<header class="mb-8 text-center">
			<p class="mb-2 text-sm font-semibold tracking-[0.2em] text-indigo-600 uppercase">
				Image tools
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Background Remover</h1>
			<p class="mx-auto mt-3 max-w-xl text-slate-600">
				Upload one image and get a transparent PNG with the background removed.
			</p>
		</header>

		<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
				<label class="block flex-1">
					<span class="mb-2 block text-sm font-medium">Choose an image</span>
					<input
						class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						disabled={isProcessing}
						onchange={handleFileChange}
					/>
					<span class="mt-2 block text-xs text-slate-500">JPEG, PNG, or WebP · up to 4 MB</span>
				</label>

				<div class="flex gap-3">
					<button
						class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
						onclick={processImage}
						disabled={!selectedFile || isProcessing || !!result}
					>
						{isProcessing ? 'Working…' : 'Remove background'}
					</button>
					<button
						class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={clearSelection}
						disabled={isProcessing || (!selectedFile && !result)}
					>
						Clear
					</button>
				</div>
			</div>

			<p class="mt-5 text-sm text-slate-600" aria-live="polite">{statusMessage}</p>
			{#if errorMessage}
				<p class="mt-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
					{errorMessage}
				</p>
			{/if}
			<p class="mt-4 text-xs text-slate-500">
				Uploaded images are stored in UploadThing. Clearing this page removes the preview but does
				not delete those files.
			</p>
		</section>

		{#if previewUrl || result}
			<section class="mt-8 grid gap-5 sm:grid-cols-2" aria-label="Image results">
				<article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div class="border-b border-slate-100 px-4 py-3">
						<h2 class="font-semibold">Original</h2>
					</div>
					<div class="flex min-h-64 items-center justify-center bg-slate-100 p-4">
						<img
							class="max-h-[32rem] max-w-full object-contain"
							src={result?.original.url ?? previewUrl ?? ''}
							alt="Original"
						/>
					</div>
					{#if result}
						<div class="border-t border-slate-100 px-4 py-3">
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								class="text-sm font-medium text-indigo-700 hover:text-indigo-900"
								href={result.original.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								Open original
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</div>
					{/if}
				</article>

				{#if result}
					<article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div class="border-b border-slate-100 px-4 py-3">
							<h2 class="font-semibold">Background removed</h2>
						</div>
						<div
							class="flex min-h-64 items-center justify-center bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%),linear-gradient(45deg,#e2e8f0_25%,white_25%,white_75%,#e2e8f0_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] p-4"
						>
							<img
								class="max-h-[32rem] max-w-full object-contain"
								src={result.processed.url}
								alt="Background removed"
							/>
						</div>
						<div class="border-t border-slate-100 px-4 py-3">
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
								href={result.processed.url}
								download="background-removed.png"
							>
								Download transparent PNG
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</div>
					</article>
				{/if}
			</section>
		{/if}
	</div>
</main>

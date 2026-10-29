import { UPLOADTHING_TOKEN } from '$app/env/private';
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import { UTApi, UTFile } from 'uploadthing/server';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32_000_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isUploadThingHost(hostname: string): boolean {
	return hostname === 'utfs.io' || hostname === 'ufs.sh' || /^[a-z0-9-]+\.ufs\.sh$/.test(hostname);
}

const uploadthing = new UTApi({ token: UPLOADTHING_TOKEN });

export class ImageProcessingError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ImageProcessingError';
	}
}

function validateUploadReference(fileKey: string, fileUrl: string): URL {
	if (!/^[A-Za-z0-9._-]{1,256}$/.test(fileKey)) {
		throw new ImageProcessingError('Invalid uploaded file key.', 400);
	}

	let url: URL;
	try {
		url = new URL(fileUrl);
	} catch {
		throw new ImageProcessingError('Invalid uploaded file URL.', 400);
	}

	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(url.pathname);
	} catch {
		throw new ImageProcessingError('Invalid uploaded file URL.', 400);
	}

	if (
		url.protocol !== 'https:' ||
		!isUploadThingHost(url.hostname) ||
		url.port !== '' ||
		url.username !== '' ||
		url.password !== '' ||
		url.search !== '' ||
		url.hash !== '' ||
		decodedPath !== `/f/${fileKey}`
	) {
		throw new ImageProcessingError('The uploaded file reference is not valid.', 400);
	}

	return url;
}

function detectImageType(bytes: Uint8Array): string | null {
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'image/png';
	}

	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}

	if (
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
		String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
	) {
		return 'image/webp';
	}

	return null;
}

async function readLimitedImage(response: Response): Promise<Uint8Array> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
		throw new ImageProcessingError('The image must be 4 MB or smaller.', 413);
	}

	if (!response.body) {
		throw new ImageProcessingError('The uploaded image could not be read.', 422);
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			totalBytes += value.byteLength;
			if (totalBytes > MAX_IMAGE_BYTES) {
				await reader.cancel();
				throw new ImageProcessingError('The image must be 4 MB or smaller.', 413);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return bytes;
}

export async function processUploadedImage(fileKey: string, fileUrl: string) {
	const originalUrl = validateUploadReference(fileKey, fileUrl);

	let response: Response;
	try {
		response = await fetch(originalUrl, { redirect: 'error' });
	} catch {
		throw new ImageProcessingError('Could not retrieve the uploaded image.', 502);
	}

	if (!response.ok) {
		throw new ImageProcessingError('Could not retrieve the uploaded image.', 502);
	}

	const imageBytes = await readLimitedImage(response);
	const imageType = detectImageType(imageBytes);
	if (!imageType || !ALLOWED_IMAGE_TYPES.has(imageType)) {
		throw new ImageProcessingError('Choose a JPEG, PNG, or WebP image.', 415);
	}

	let dimensions: sharp.Metadata;
	try {
		dimensions = await sharp(imageBytes, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
	} catch {
		throw new ImageProcessingError('The uploaded file is not a valid image.', 415);
	}
	if (
		!dimensions.width ||
		!dimensions.height ||
		dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
	) {
		throw new ImageProcessingError('The image dimensions are too large to process.', 413);
	}

	let processedImage: Blob;
	try {
		processedImage = await removeBackground(
			new Blob([imageBytes.buffer as ArrayBuffer], { type: imageType }),
			{
				model: 'small',
				output: { format: 'image/png' }
			}
		);
	} catch (error) {
		console.error('IMG.LY background removal failed:', error);
		throw new ImageProcessingError(
			'The image could not be processed. Please try another image.',
			500
		);
	}

	const uploadedResult = await uploadthing.uploadFiles(
		new UTFile([processedImage], 'background-removed.png', { type: 'image/png' }),
		{ contentDisposition: 'attachment' }
	);

	if (uploadedResult.error || !uploadedResult.data) {
		console.error('UploadThing result upload failed:', uploadedResult.error);
		throw new ImageProcessingError('The processed image could not be saved.', 502);
	}

	return {
		original: { key: fileKey, url: originalUrl.toString() },
		processed: { key: uploadedResult.data.key, url: uploadedResult.data.ufsUrl }
	};
}

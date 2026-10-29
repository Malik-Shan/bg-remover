import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ImageProcessingError, processUploadedImage } from '#lib/server/image-processing.ts';

let processingInProgress = false;
const MAX_REQUEST_BYTES = 2048;

class RequestBodyTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
	if (!request.body) throw new Error('Invalid request body.');

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			totalBytes += value.byteLength;
			if (totalBytes > MAX_REQUEST_BYTES) {
				await reader.cancel();
				throw new RequestBodyTooLargeError();
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

	return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim();
	if (contentType !== 'application/json') {
		return json({ error: 'Expected a JSON request.' }, { status: 415 });
	}
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > 2048) {
		return json({ error: 'The request is too large.' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = await readJsonBody(request);
	} catch (error) {
		if (error instanceof RequestBodyTooLargeError) {
			return json({ error: 'The request is too large.' }, { status: 413 });
		}
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	if (
		typeof body !== 'object' ||
		body === null ||
		!('fileKey' in body) ||
		!('fileUrl' in body) ||
		typeof body.fileKey !== 'string' ||
		typeof body.fileUrl !== 'string'
	) {
		return json({ error: 'An uploaded image is required.' }, { status: 400 });
	}

	if (processingInProgress) {
		return json(
			{ error: 'Another image is being processed. Please try again shortly.' },
			{ status: 429, headers: { 'retry-after': '15' } }
		);
	}

	processingInProgress = true;
	try {
		const result = await processUploadedImage(body.fileKey, body.fileUrl);
		return json(result);
	} catch (error) {
		if (error instanceof ImageProcessingError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('Unexpected image processing error:', error);
		return json({ error: 'Could not process the image. Please try again.' }, { status: 500 });
	} finally {
		processingInProgress = false;
	}
};

import { createUploadthing } from 'uploadthing/server';
import type { FileRouter } from 'uploadthing/server';

const createFileRoute = createUploadthing();

// Authentication is intentionally left as a placeholder for this MVP.
const getCurrentUser = () => ({ id: 'anonymous' });

export const ourFileRouter = {
	imageUploader: createFileRoute({
		image: {
			maxFileSize: '4MB',
			maxFileCount: 1
		}
	})
		.middleware(async () => {
			const user = getCurrentUser();
			return { userId: user.id };
		})
		.onUploadComplete(() => undefined)
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

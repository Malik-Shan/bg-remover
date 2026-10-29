import { UPLOADTHING_TOKEN } from '$app/env/private';
import { createRouteHandler } from 'uploadthing/server';
import { ourFileRouter } from '#lib/server/uploadthing.ts';

const handlers = createRouteHandler({
	router: ourFileRouter,
	config: { token: UPLOADTHING_TOKEN }
});

export { handlers as GET, handlers as POST };

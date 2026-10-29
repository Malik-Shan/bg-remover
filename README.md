# Background Remover

A SvelteKit app that uploads one image to UploadThing, removes its background on the Node.js server with IMG.LY, and stores the transparent PNG in UploadThing.

## Requirements

- Node.js
- An UploadThing account and token

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `UPLOADTHING_TOKEN`.
3. Start the development server with `npm run dev`.

The upload route accepts one image up to 4 MB. Supported processing formats are JPEG, PNG, and WebP. IMG.LY downloads its model assets on first use, so the first processing request may take longer.

## Processing flow

1. The browser uploads the original image through the UploadThing file route.
2. The browser sends the UploadThing file key and URL to `POST /api/process`.
3. The Node.js endpoint validates the UploadThing URL, downloads and checks the image, and runs background removal.
4. The server uploads the transparent PNG through UploadThing and returns both file URLs.

The app currently has placeholder anonymous upload metadata and no user accounts or database. Clearing the page only clears the local preview; uploaded files remain in UploadThing. Configure file retention in UploadThing or add authenticated ownership and scheduled deletion before using this as a public service.

## License note

`@imgly/background-removal-node` is distributed under the AGPL license. Review whether that license fits your use before distributing or hosting the app.
